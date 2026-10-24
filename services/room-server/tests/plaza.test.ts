import test from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN_CARD } from '@pplale/game-core';
import { MEMBER_GRACE } from '@pplale/game-core/room';
import type { Entered, RoomInfo, RoomView } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import { actPlaza, admit, askToEnter, createPlaza, entryOf, formerOf, tidyPlaza } from '../src/plaza.ts';
import { connect, deck, serve, shared } from './helpers.ts';
import type { Client, Served } from './helpers.ts';

const rules = { fruits: ['strawberry' as const], extendedPlayable: false };
const make = (served: Served, visibility: string, name = 'ありす') => served.call<Entered>('/rooms', { rules, name, plaza: { name: 'おちゃかい', visibility } });
/** Waits until the member's view has a match whose revision passed `revision` (or satisfies `test`). */
const until = (client: Client, test: (view: RoomView) => boolean) => client.until(test);

test('plaza: made for its creator (not seated, owner), and an invited room is only found with its invitation', async () => {
    const served = await serve(), { call } = served;
    const made = await make(served, 'invite');
    assert.equal(made.status, 200);
    const { view, token } = made.data;
    assert.equal(view.plaza!.name, 'おちゃかい');
    assert.equal(view.plaza!.visibility, 'invite');
    assert.equal(view.plaza!.owner, view.plaza!.me);
    assert.deepEqual(view.players, [null, null]);
    assert.equal(view.watching, true);
    const invite = view.plaza!.invite!;
    assert.ok(invite.length >= 24);
    // Without the invitation the room cannot be told apart from one that does not exist.
    assert.equal((await call(`/rooms/${view.id}`)).status, 404);
    assert.equal((await call(`/rooms/${view.id}/join`, { name: 'ぼぶ' })).status, 404);
    assert.equal((await call(`/rooms/${view.id}/join`, { name: 'ぼぶ', invite: 'x'.repeat(invite.length) })).status, 404);
    const info = await call<RoomInfo>(`/rooms/${view.id}?invite=${invite}`);
    assert.equal(info.status, 200);
    assert.deepEqual(info.data.plaza, { name: 'おちゃかい', visibility: 'invite', creator: { name: 'ありす' }, members: 1, seated: 0 });
    const joined = await call<Entered>(`/rooms/${view.id}/join`, { name: 'ぼぶ', invite });
    assert.equal(joined.status, 200);
    // Only the owner of an invite room may hand out its link.
    assert.equal(joined.data.view.plaza!.invite, undefined);
    assert.equal(joined.data.view.plaza!.members.length, 2);
    const alice = await connect(served, view.id, token);
    await until(alice, next => next.plaza!.members.length === 2 && next.plaza!.members[0].online);
    // A new link ends the old one.
    assert.equal(await alice.act({ action: 'renewInvite' }), undefined);
    const renewed = alice.latest().plaza!.invite!;
    assert.notEqual(renewed, invite);
    assert.equal((await call(`/rooms/${view.id}/join`, { name: 'きゃろる', invite })).status, 404);
    assert.equal((await call(`/rooms/${view.id}/join`, { name: 'きゃろる', invite: renewed })).status, 200);
    await served.close();
});

test('plaza: a public room is entered by anyone; seats are taken from the table and the match is watched without hidden cards', async () => {
    const served = await serve(), { call } = served;
    const { data: made } = await make(served, 'public');
    const id = made.view.id;
    assert.equal((await call<RoomInfo>(`/rooms/${id}`)).data.plaza!.visibility, 'public');
    const [bob, carol] = await Promise.all(['ぼぶ', 'きゃろる'].map(name => call<Entered>(`/rooms/${id}/join`, { name })));
    const alice = await connect(served, id, made.token), b = await connect(served, id, bob.data.token), c = await connect(served, id, carol.data.token);
    await until(alice, view => view.plaza!.members.filter(member => member.online).length === 3);

    // The creator may only watch; the others sit down.
    assert.equal(await b.act({ action: 'ready', deck }), '席に座ってから選んでください');
    assert.equal(await b.act({ action: 'sit', seat: 0 }), undefined);
    assert.equal(await c.act({ action: 'sit', seat: 0 }), 'その席にはもう誰かが座っています');
    assert.equal(await c.act({ action: 'sit', seat: 1 }), undefined);
    assert.equal(await b.act({ action: 'ready', deck }), undefined);
    // Someone new sitting across asks the seated player again; the deck stays with its owner.
    assert.equal(await c.act({ action: 'stand' }), undefined);
    assert.equal((await until(b, view => !view.players[1])).players[0]!.ready, true);
    assert.equal(await c.act({ action: 'sit', seat: 1 }), undefined);
    assert.equal((await until(b, view => !!view.players[1])).players[0]!.ready, false);
    assert.equal(await b.act({ action: 'ready', deck }), undefined);
    assert.equal(await c.act({ action: 'ready', deck }), undefined);
    const watched = await until(alice, view => view.status === 'playing');
    assert.equal(watched.watching, true);
    assert.equal(watched.ownDeck, undefined);
    const played = await until(b, view => view.status === 'playing');
    assert.equal(played.seat, 0);
    assert.ok(played.ownDeck);
    // Seats are not taken during a match.
    assert.equal(await alice.act({ action: 'sit', seat: 0 }), '対戦が終わってから選べます');
    // Play until the opening hands are drawn, then the spectator sees neither hand.
    const command = async (client: Client, seat: 0 | 1, sent: object) => {
        const error = await client.act({ action: 'command', command: { ...sent, actor: seat } as never, revision: client.latest().game!.revision });
        const revision = client.latest().game!.revision;
        await Promise.all([b, c].map(other => until(other, view => !!view.game && view.game.revision >= revision)));
        return error;
    };
    while (b.latest().game!.phase === 'dice') {
        assert.equal(await command(b, 0, { type: 'roll' }), undefined);
        assert.equal(await command(c, 1, { type: 'roll' }), undefined);
    }
    const first = b.latest().game!.active, chooser = first === 0 ? b : c;
    assert.equal(await command(chooser, first, { type: 'initiative', order: 'first' }), undefined);
    for (const [client, seat] of [[b, 0], [c, 1]] as const) {
        for (let draw = 0; draw < 8 && client.latest().game!.phase === 'opening' && client.latest().game!.openingRemaining[seat] > 0; draw++) await command(client, seat, { type: 'openingDraw', deck: draw % 2 ? 'sweet' : 'yojo' });
    }
    const spectator = await until(alice, view => !!view.game && view.game.players.every(player => player.hand.length > 0));
    for (const player of spectator.game!.players) for (const uid of player.hand) assert.equal(spectator.game!.cards[uid].cardId, HIDDEN_CARD);
    // Standing up during a match loses it and the seat stays named until the table is back.
    assert.equal(await b.act({ action: 'stand' }), undefined);
    const ended = await until(c, view => view.status === 'finished');
    assert.equal(ended.resigned, 0);
    assert.equal(ended.players[0]!.left, true);
    assert.ok(ended.replayId);
    assert.equal((await until(alice, view => view.status === 'finished')).replayId, undefined);
    // The one who stays keeps the seat for the next match; the one who left frees theirs.
    assert.equal(await c.act({ action: 'rematch' }), undefined);
    const table = await until(alice, view => view.status === 'lobby');
    assert.equal(table.players[0], null);
    assert.equal(table.players[1]!.member, carol.data.view.plaza!.me);
    assert.equal(table.players[1]!.ready, false);
    await served.close();
});

test('plaza: an owner who leaves leaves it without one; one person becomes the next, and only the owner changes the rules', async () => {
    const served = await serve(), { call } = served;
    const { data: made } = await make(served, 'public');
    const id = made.view.id;
    const others = await Promise.all(['ぼぶ', 'きゃろる'].map(name => call<Entered>(`/rooms/${id}/join`, { name })));
    const alice = await connect(served, id, made.token);
    const [b, c] = await Promise.all(others.map(entry => connect(served, id, entry.data.token)));
    await until(alice, view => view.plaza!.members.every(member => member.online));
    assert.equal(await b.act({ action: 'rules', rules: { ...rules, turnSeconds: 120 } }), 'ルールを変えられるのはオーナーだけです');
    assert.equal(await alice.act({ action: 'rules', rules: { ...rules, turnSeconds: 180 } }), undefined);
    assert.equal((await until(b, view => view.rules.turnSeconds === 180)).rules.turnSeconds, 180);
    assert.equal(await b.act({ action: 'claim' }), 'ほかの人がオーナーになりました');
    assert.equal(await alice.act({ action: 'leave' }), undefined);
    const without = await until(b, view => view.plaza!.members.length === 2);
    assert.equal(without.plaza!.owner, null);
    // The creator stays the creator.
    assert.equal(without.plaza!.creator.name, 'ありす');
    assert.equal(alice.gone(), 'ルームから出ました');
    const claims = await Promise.all([b.act({ action: 'claim' }), c.act({ action: 'claim' })]);
    assert.deepEqual(claims.filter(error => error === undefined).length, 1);
    const owner = (await until(c, view => view.plaza!.owner !== null)).plaza!.owner;
    const ownerClient = owner === others[0].data.view.plaza!.me ? b : c;
    // During a match the rules wait for the next one.
    for (const [client, seat] of [[b, 0], [c, 1]] as const) await client.act({ action: 'sit', seat });
    for (const client of [b, c]) await client.act({ action: 'ready', deck });
    await until(b, view => view.status === 'playing');
    assert.equal(await ownerClient.act({ action: 'rules', rules: { ...rules, turnSeconds: 300 } }), undefined);
    const during = await until(b, view => !!view.plaza!.nextRules);
    assert.equal(during.rules.turnSeconds, 180);
    assert.equal(during.plaza!.nextRules!.turnSeconds, 300);
    await b.act({ action: 'resign' });
    await c.act({ action: 'rematch' });
    const next = await until(b, view => view.status === 'lobby');
    assert.equal(next.rules.turnSeconds, 300);
    assert.equal(next.plaza!.nextRules, undefined);
    await served.close();
});

test('plaza: the CPU sits at the table and plays its moves itself, and leaves no room open on its own', async () => {
    const served = await serve(), { call, backend } = served;
    const { data: made } = await make(served, 'invite');
    const id = made.view.id, alice = await connect(served, id, made.token);
    await until(alice, view => view.plaza!.members[0].online);
    assert.equal(await alice.act({ action: 'cpu', seat: 1, level: 'normal' }), undefined);
    assert.equal(await alice.act({ action: 'cpu', seat: 0, level: 'easy' }), 'CPUはもう来ています');
    const table = await until(alice, view => !!view.players[1]);
    assert.equal(table.players[1]!.cpu, 'normal');
    assert.equal(table.players[1]!.ready, true);
    assert.equal(table.players[1]!.name, 'CPU・ふつう');
    assert.equal(await alice.act({ action: 'sit', seat: 0 }), undefined);
    assert.equal(await alice.act({ action: 'ready', deck }), undefined);
    await until(alice, view => view.status === 'playing');
    const command = (sent: object) => alice.act({ action: 'command', command: { ...sent, actor: 0 } as never, revision: alice.latest().game!.revision });
    // The CPU throws its die after ours and, winning it, chooses; we choose when we win.
    for (let round = 0; round < 6 && alice.latest().game!.phase === 'dice'; round++) {
        assert.equal(await command({ type: 'roll' }), undefined);
        // A tie keeps both dice shown until the next throw.
        await until(alice, view => view.game!.phase !== 'dice' || view.game!.dice!.rolls[1] !== null);
    }
    if (alice.latest().game!.phase === 'initiative' && alice.latest().game!.active === 0) await command({ type: 'initiative', order: 'first' });
    // The CPU draws its opening hand while we draw ours.
    const opened = await until(alice, view => view.game!.phase !== 'initiative' && view.game!.openingRemaining[1] === 0);
    assert.ok(opened.game!.players[1].hand.length > 0);
    assert.ok(opened.last?.command.actor === 1 || opened.game!.openingRemaining[1] === 0);
    // Nobody but the CPU left: the room closes.
    assert.equal(await alice.act({ action: 'leave' }), undefined);
    const closed = await backend.get(id);
    assert.equal(closed!.status, 'closed');
    assert.equal((await call(`/rooms/${id}/join`, { name: 'ぼぶ', invite: made.view.plaza!.invite })).status, 410);
    await served.close();
});

test('plaza: a member away longer than the grace is no longer in it; the last one closes it and may make its successor once', async () => {
    const data = shared(), served = await serve({ data }), other = await serve({ data }), { call, backend } = served;
    const { data: made } = await make(served, 'invite');
    const id = made.view.id;
    const bob = (await call<Entered>(`/rooms/${id}/join`, { name: 'ぼぶ', invite: made.view.plaza!.invite })).data;
    // Everyone is away for good: tidying a little after the grace removes them and closes the room.
    const room = (await backend.get(id))!;
    const tidied = tidyPlaza(room, new Set(), Date.now() + MEMBER_GRACE + 1)!;
    assert.deepEqual(tidied.removed!.length, 2);
    assert.equal(room.status, 'closed');
    assert.ok(formerOf(room, made.token) && formerOf(room, bob.token));
    room.version++;
    assert.ok(await backend.replace(room, room.version - 1, 60_000));
    const socket = await connect(served, id, made.token);
    assert.equal(await socket.closed, 4404);
    assert.equal(socket.gone(), 'このルームは閉じました');
    // Coming back from two instances at once makes one successor, with the same name and visibility.
    const [a, b] = await Promise.all([
        served.call<Entered>('/rooms', { rules, name: 'ありす', plaza: { name: '別の名前', visibility: 'public', from: { id, token: made.token } } }),
        other.call<Entered>('/rooms', { rules, name: 'ぼぶ', plaza: { name: '別の名前', visibility: 'public', from: { id, token: bob.token } } }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.data.view.id, b.data.view.id);
    assert.notEqual(a.data.view.id, id);
    assert.equal(a.data.view.plaza!.name, 'おちゃかい');
    assert.equal(a.data.view.plaza!.visibility, 'invite');
    // A stranger with an old link makes a room of their own, not the successor.
    const stranger = await served.call<Entered>('/rooms', { rules, name: 'きゃろる', plaza: { name: 'きゃろるの', visibility: 'public', from: { id, token: 'not-a-member' } } });
    assert.notEqual(stranger.data.view.id, a.data.view.id);
    assert.equal(stranger.data.view.plaza!.visibility, 'public');
    await Promise.all([served.close(), other.close()]);
});

test('plaza: looking rooms up tells only of those the asker may enter, and names the friend-only ones only to friends', async () => {
    const served = await serve(), { call } = served;
    const [open, invited, friends] = await Promise.all(['public', 'invite', 'invitePlus'].map(visibility => make(served, visibility)));
    const { data } = await call<{ rooms: RoomInfo[] }>('/rooms/lookup', { ids: [open.data.view.id, invited.data.view.id, friends.data.view.id, '000000', 'nope'] });
    assert.deepEqual(data.rooms.map(room => room.id), [open.data.view.id]);
    assert.equal(data.rooms[0].plaza!.members, 1);
    // Asking and being invited need a signed-in player.
    assert.equal((await call('/rooms/invited', {})).status, 401);
    assert.equal((await call('/rooms/ask', { to: 'someone' })).status, 401);
    assert.equal((await call(`/rooms/${invited.data.view.id}/invite`, { member: invited.data.token, to: 'someone' })).status, 401);
    await served.close();
});

test('plaza: who may come in, by visibility', () => {
    const creator = { name: 'ありす', profileId: 'alice' };
    const room = (visibility: string) => createPlaza('123456', { rules, plaza: { visibility } }, creator).room;
    assert.equal(entryOf(room('public'), {}, null), 'yes');
    assert.deepEqual(entryOf(room('friends'), { profileId: 'bob' }, null), { friendsOf: ['alice'] });
    assert.equal(entryOf(room('friends'), {}, null), 'no');
    const plus = room('friendsPlus');
    admit(plus, { name: 'ぼぶ', profileId: 'bob' });
    assert.deepEqual(entryOf(plus, { profileId: 'carol' }, null), { friendsOf: ['alice', 'bob'] });
    const invited = room('invitePlus');
    assert.equal(entryOf(invited, { profileId: 'carol' }, null), 'no');
    assert.equal(entryOf(invited, { profileId: 'carol' }, invited.plaza!.invite), 'yes');
    assert.equal(entryOf(invited, { profileId: 'alice' }, null), 'yes');
    // In an invitePlus room anyone in it may invite by name; in an invite room only its owner.
    const bob = admit(invited, { name: 'ぼぶ', profileId: 'bob' }).member;
    actPlaza(invited, bob.id, { action: 'invite', profileId: 'carol' }, catalog);
    assert.equal(entryOf(invited, { profileId: 'carol' }, null), 'yes');
    const strict = room('invite'), guest = admit(strict, { name: 'ぼぶ' }).member;
    assert.throws(() => actPlaza(strict, guest.id, { action: 'invite', profileId: 'carol' }, catalog), /オーナーだけ/);
    // A friend asks to come into an invite room: only its owner answers; accepting lets them in by name.
    const asked = room('invite'), owner = asked.plaza!.members[0], helper = admit(asked, { name: 'ぼぶ', profileId: 'bob' }).member;
    assert.equal(askToEnter(asked, { name: 'きゃろる', profileId: 'carol' }), true);
    assert.equal(askToEnter(asked, { name: 'ありす', profileId: 'alice' }), false);
    assert.deepEqual(asked.plaza!.requests.map(request => request.profileId), ['carol']);
    assert.throws(() => actPlaza(asked, helper.id, { action: 'answer', profileId: 'carol', accept: true }, catalog), /オーナーだけ/);
    assert.equal(actPlaza(asked, owner.id, { action: 'answer', profileId: 'carol', accept: true }, catalog).invited, 'carol');
    assert.equal(entryOf(asked, { profileId: 'carol' }, null), 'yes');
    assert.deepEqual(asked.plaza!.requests, []);
    // Declining tells nobody and lets nobody in; a public room is not asked.
    askToEnter(asked, { name: 'でいぶ', profileId: 'dave' });
    assert.equal(actPlaza(asked, owner.id, { action: 'answer', profileId: 'dave', accept: false }, catalog).invited, undefined);
    assert.equal(entryOf(asked, { profileId: 'dave' }, null), 'no');
    assert.equal(askToEnter(room('public'), { name: 'でいぶ', profileId: 'dave' }), false);
    // A guest's friends' room and an unknown visibility are invited rooms.
    assert.equal(createPlaza('123456', { rules, plaza: { visibility: 'friends' } }, { name: 'げすと' }).room.plaza!.visibility, 'invite');
    assert.equal(createPlaza('123456', { rules, plaza: { visibility: 'everyone' } }, creator).room.plaza!.visibility, 'invite');
});
