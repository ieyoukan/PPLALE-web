import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { MAX_MEMBERS } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { admit, createPlaza } from '../src/plaza.ts';
import { serve } from './helpers.ts';

const rules = { fruits: ['strawberry'], extendedPlayable: false };

test('room browser: guests see every public plaza, with no closed, empty, full or private rooms leaked', async t => {
    const served = await serve(); t.after(() => served.close());
    for (let index = 0; index < 30; index++) {
        const { room } = createPlaza(String(100000 + index), { rules, plaza: { name: `公開${index}`, visibility: 'public' } }, { name: 'ゲスト' });
        await served.backend.create(room, 60_000);
    }
    const hidden = createPlaza('200000', { rules, plaza: { name: '秘密のルーム', visibility: 'invite' } }, { name: 'ゲスト' });
    const full = createPlaza('200001', { rules, plaza: { visibility: 'public' } }, { name: 'ゲスト' });
    for (let i = 1; i < MAX_MEMBERS; i++) admit(full.room, { name: `ゲスト${i}` });
    const closed = createPlaza('200002', { rules, plaza: { visibility: 'public' } }, { name: 'ゲスト' });
    closed.room.status = 'closed';
    const empty = createPlaza('200003', { rules, plaza: { visibility: 'public' } }, { name: 'ゲスト' });
    empty.room.plaza!.members = [];
    for (const made of [hidden, full, closed, empty]) await served.backend.create(made.room, 60_000);
    await served.call('/rooms', { rules, name: '旧2人用ルーム' });
    const browse = (body: unknown = {}) => served.call<{ rooms: RoomInfo[] }>('/rooms/browse', body);
    const publicRooms = await browse();
    assert.equal(publicRooms.status, 200);
    assert.equal(publicRooms.data.rooms.length, 30, 'browsing is not truncated to the 24-id lookup limit');
    assert.ok(publicRooms.data.rooms.every(room => room.plaza?.visibility === 'public' && room.open));
    assert.equal((await browse({ profileId: 'reader', known: [{ id: hidden.room.id, token: 'wrong', invite: 'wrong' }] })).data.rooms.length, 30);
    const remembered = await browse({ known: [{ id: hidden.room.id, invite: hidden.room.plaza!.invite }, { id: full.room.id, token: full.token }] });
    assert.equal(remembered.data.rooms.length, 32, 'known invitation holders and existing members may return');
    assert.equal(remembered.data.rooms[0].id, full.room.id, 'rooms are ordered by the number of members');
    assert.doesNotMatch(JSON.stringify(remembered.data), /"(?:invite|token|tokens|allowed)":/);
    // A refreshed list does not retain vanished rooms or an invitation that has been renewed.
    const old = (await served.backend.get(hidden.room.id))!;
    const previous = old.version; old.plaza!.invite = 'new-secret'; old.version++;
    await served.backend.replace(old, previous, 60_000);
    assert.equal((await browse({ known: [{ id: hidden.room.id, invite: hidden.room.plaza!.invite }] })).data.rooms.length, 30);
});

test('room browser: verified friendships and named invitations determine access, reading friends only once', async t => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...await exportJWK(publicKey), kid: 'browser-test', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('reader').setIssuedAt().setExpirationTime('5m').setIssuer('https://securetoken.google.com/pplale-6cca0').setAudience('pplale-6cca0').sign(privateKey);
    const realFetch = globalThis.fetch;
    let friendReads = 0;
    globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
        const address = String(url);
        if (address.includes('www.googleapis.com/service_accounts/v1/jwk/')) return Response.json({ keys: [jwk] });
        if (address.includes('firestore.googleapis.com/') && address.endsWith(':runQuery')) {
            friendReads++;
            return Response.json(['creator-friend', 'member-friend'].map(friend => ({ document: { fields: {
                members: { arrayValue: { values: [{ stringValue: 'reader' }, { stringValue: friend }] } }, status: { stringValue: 'accepted' },
            } } })));
        }
        return realFetch(url, options);
    }) as typeof fetch;
    t.after(() => { globalThis.fetch = realFetch; });
    const served = await serve(); t.after(() => served.close());
    const make = async (id: string, visibility: string, creator = 'stranger', member?: string, allowed?: string) => {
        const { room } = createPlaza(id, { rules, plaza: { visibility } }, { name: creator, profileId: creator });
        if (member) admit(room, { name: member, profileId: member });
        if (allowed) room.plaza!.allowed.push(allowed);
        await served.backend.create(room, 60_000);
    };
    await make('300001', 'public');
    await make('300002', 'friends', 'creator-friend');
    await make('300003', 'friendsPlus', 'stranger', 'member-friend');
    await make('300004', 'friends', 'stranger', 'member-friend');
    await make('300005', 'friendsPlus');
    await make('300006', 'invite', 'creator-friend');
    await make('300007', 'invite', 'stranger', undefined, 'reader');
    await make('300008', 'invitePlus', 'stranger', undefined, 'reader');
    await make('300009', 'invite', 'reader');
    const result = await served.call<{ rooms: RoomInfo[] }>('/rooms/browse', {}, { authorization: `Bearer ${token}` });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.rooms.map(room => room.id).sort(), ['300001', '300002', '300003', '300007', '300008', '300009']);
    assert.equal(friendReads, 1);
    assert.doesNotMatch(JSON.stringify(result.data), /"(?:invite|token|tokens|allowed)":/);
});
