import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_GRACE } from '@pplale/game-core/room';
import type { Entered } from '@pplale/game-core/room';
import { actPlaza, admit, createPlaza, notePresence, plazaView, tidyPlaza } from '../src/plaza.ts';
import { catalog } from '../src/catalog.ts';
import { connect, deck, serve, shared } from './helpers.ts';

const rules = { fruits: ['strawberry' as const], extendedPlayable: false };
const initial = (profileId?: string) => createPlaza('123456', { rules, plaza: { name: 'お茶会', visibility: 'public' } }, { name: 'ありす', ...(profileId && { profileId }) }, 0);
function expiredOwner(profileId?: string) {
    const made = initial(profileId), { room } = made, old = room.plaza!.owner!;
    const other = admit(room, { name: 'ぼぶ' }, 0).member;
    notePresence(room, new Set([old, other.id]), 0);
    tidyPlaza(room, new Set([other.id]), 100);
    tidyPlaza(room, new Set([other.id]), 101 + MEMBER_GRACE);
    assert.equal(room.plaza!.owner, null);
    return { ...made, old, other };
}

test('ownership: rejoining with an active guest secret preserves the member, seat, readiness and owner', () => {
    const { room, token } = initial(), me = room.plaza!.owner!;
    actPlaza(room, me, { action: 'sit', seat: 0 }, catalog);
    actPlaza(room, me, { action: 'ready', deck }, catalog);
    const seat = structuredClone(room.seats[0]), creator = structuredClone(room.plaza!.creator);
    const joined = admit(room, { name: 'ありす' }, 1000, token);
    assert.equal(joined.member.id, me);
    assert.equal(room.plaza!.owner, me);
    assert.equal(room.plaza!.members.length, 1);
    assert.deepEqual(room.seats[0], seat);
    assert.deepEqual(room.plaza!.creator, creator);
    assert.notEqual(joined.token, token);
});

for (const profileId of [undefined, 'verified-owner']) test(`ownership: an expired ${profileId ? 'signed-in' : 'guest'} owner regains an unclaimed role with the same identity and secret`, () => {
    const { room, token, old } = expiredOwner(profileId), creator = structuredClone(room.plaza!.creator);
    const joined = admit(room, { name: 'ありす', ...(profileId && { profileId }) }, MEMBER_GRACE + 1000, token);
    assert.notEqual(joined.member.id, old);
    assert.equal(room.plaza!.owner, joined.member.id);
    assert.equal(room.plaza!.formerOwner, undefined);
    assert.deepEqual(room.plaza!.creator, creator);
    const view = plazaView(room, joined.member.id, new Set([joined.member.id]), catalog);
    assert.equal('formerOwner' in view.plaza!, false);
    assert.equal('tokens' in view.plaza!.members[0], false);
});

test('ownership: a changed account or a missing proof never inherits the previous owner', () => {
    for (const profileId of [undefined, 'different-user']) {
        const { room, token } = expiredOwner('verified-owner');
        const joined = admit(room, { name: '新しい人', ...(profileId && { profileId }) }, MEMBER_GRACE + 1000, token);
        assert.notEqual(room.plaza!.owner, joined.member.id);
        assert.equal(room.plaza!.owner, null);
    }
    const { room } = expiredOwner('verified-owner');
    admit(room, { name: 'ありす', profileId: 'verified-owner' });
    assert.equal(room.plaza!.owner, null, 'an ordinary new admission is not a reconnection');
});

test('ownership: another tab can prove the expired owner after the same account has already re-entered', () => {
    const { room, token } = expiredOwner('verified-owner');
    const visitor = { name: 'ありす', profileId: 'verified-owner' };
    const ordinary = admit(room, visitor);
    assert.equal(room.plaza!.owner, null);
    const resumed = admit(room, visitor, Date.now(), token);
    assert.equal(resumed.member.id, ordinary.member.id);
    assert.equal(room.plaza!.owner, resumed.member.id);
});

test('ownership: an explicit leave or another claim ends the previous owner’s right to resume', () => {
    const { room, token } = initial(), old = room.plaza!.owner!;
    admit(room, { name: 'ぼぶ' });
    actPlaza(room, old, { action: 'leave' }, catalog);
    admit(room, { name: 'ありす' }, 1000, token);
    assert.equal(room.plaza!.owner, null);
    const expired = expiredOwner();
    actPlaza(expired.room, expired.other.id, { action: 'claim' }, catalog);
    admit(expired.room, { name: 'ありす' }, MEMBER_GRACE + 1000, expired.token);
    assert.equal(expired.room.plaza!.owner, expired.other.id);
    assert.equal(expired.room.plaza!.creator.name, 'ありす');
});

test('ownership: online signed-in people have priority; guests can claim when those people are away', () => {
    const { room } = initial(), owner = room.plaza!.owner!;
    const guest = admit(room, { name: 'ゲスト' }).member, signed = admit(room, { name: 'ログイン済み', profileId: 'verified' }).member;
    notePresence(room, new Set([owner, guest.id, signed.id]), 0);
    actPlaza(room, owner, { action: 'leave' }, catalog);
    const unowned = structuredClone(room);
    assert.equal(plazaView(room, guest.id, new Set([guest.id, signed.id]), catalog).plaza!.canClaimOwner, false);
    assert.throws(() => actPlaza(room, guest.id, { action: 'claim' }, catalog), /ログイン中の人が先/);
    assert.deepEqual(room, unowned, 'a refused claim changes nothing');
    actPlaza(room, signed.id, { action: 'claim' }, catalog);
    assert.equal(room.plaza!.owner, signed.id);
    notePresence(unowned, new Set([guest.id]), 100);
    assert.equal(plazaView(unowned, guest.id, new Set([guest.id]), catalog).plaza!.canClaimOwner, true);
    actPlaza(unowned, guest.id, { action: 'claim' }, catalog);
    assert.equal(unowned.plaza!.owner, guest.id);
});

test('ownership: HTTP reconnection across pods preserves an active owner and recovers an expired owner', async t => {
    const data = shared(), a = await serve({ data }), b = await serve({ data });
    t.after(async () => { await a.close(); await b.close(); });
    const made = (await a.call<Entered>('/rooms', { name: 'ありす', rules, plaza: { name: 'お茶会', visibility: 'invite' } })).data;
    const id = made.view.id, original = made.view.plaza!.me;
    const active = await b.call<Entered>(`/rooms/${id}/join`, { name: 'ありす', rejoin: made.token });
    assert.equal(active.status, 200, 'the member secret works without sharing a new invitation');
    assert.equal(active.data.view.plaza!.me, original);
    assert.equal(active.data.view.plaza!.owner, original);
    const bob = (await a.call<Entered>(`/rooms/${id}/join`, { name: 'ぼぶ', invite: made.view.plaza!.invite })).data;
    const watcher = await connect(b, id, bob.token);
    await watcher.until(view => view.plaza!.members.some(member => member.id === bob.view.plaza!.me && member.online));
    const room = (await a.backend.get(id))!;
    room.plaza!.members.find(member => member.id === original)!.away = Date.now() - MEMBER_GRACE - 1;
    tidyPlaza(room, new Set([bob.view.plaza!.me]), Date.now());
    const expected = room.version++;
    assert.ok(await a.backend.replace(room, expected, 60_000));
    const returned = await a.call<Entered>(`/rooms/${id}/join`, { name: 'ありす', rejoin: active.data.token });
    assert.equal(returned.status, 200);
    assert.equal(returned.data.view.plaza!.owner, returned.data.view.plaza!.me);
    assert.notEqual(returned.data.view.plaza!.me, original);
    const restored = await connect(a, id, returned.data.token);
    await restored.until(view => view.plaza!.owner === view.plaza!.me);
    assert.equal(await restored.act({ action: 'rename', name: '復帰したお茶会' }), undefined);
    assert.equal((await watcher.until(view => view.plaza!.name === '復帰したお茶会')).plaza!.creator.name, 'ありす');
});

test('ownership: expiring a member while their socket joins returns gone instead of a view for an orphan member', async t => {
    const served = await serve(); t.after(() => served.close());
    const made = (await served.call<Entered>('/rooms', { name: 'ありす', rules, plaza: { visibility: 'public' } })).data;
    const bob = (await served.call<Entered>(`/rooms/${made.view.id}/join`, { name: 'ぼぶ' })).data;
    const other = await connect(served, made.view.id, bob.token);
    await other.until(view => view.plaza!.members.some(member => member.id === bob.view.plaza!.me && member.online));
    const enter = served.backend.enter;
    let raced = false;
    served.backend.enter = async (entry, ttl) => {
        const result = await enter.call(served.backend, entry, ttl);
        if (!raced && entry.member.startsWith(made.view.plaza!.me)) {
            raced = true;
            const room = (await served.backend.get(entry.id))!;
            tidyPlaza(room, new Set([bob.view.plaza!.me]), Date.now() + MEMBER_GRACE + 1);
            const expected = room.version++;
            assert.ok(await served.backend.replace(room, expected, 60_000));
        }
        return result;
    };
    const returned = await connect(served, made.view.id, made.token);
    assert.equal(await returned.closed, 4404);
    assert.equal(returned.views.length, 0);
    const recovered = await served.call<Entered>(`/rooms/${made.view.id}/join`, { name: 'ありす', rejoin: made.token });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.data.view.plaza!.owner, recovered.data.view.plaza!.me);
});
