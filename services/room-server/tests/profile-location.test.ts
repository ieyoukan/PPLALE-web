import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import type { ProfileLocation } from '@pplale/game-core/room';
import { createPlaza } from '../src/plaza.ts';
import { serve, connect } from './helpers.ts';

test('profile location: authenticates friends, checks live presence and masks invited rooms', async t => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...await exportJWK(publicKey), kid: 'location-test', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('reader').setIssuedAt().setExpirationTime('5m').setIssuer('https://securetoken.google.com/pplale-6cca0').setAudience('pplale-6cca0').sign(privateKey);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
        const address = String(url);
        if (address.includes('www.googleapis.com/service_accounts/v1/jwk/')) return Response.json({ keys: [jwk] });
        if (address.includes('firestore.googleapis.com/')) {
            if (address.includes('/friendships/')) return address.includes('stranger') ? new Response('', { status: 404 }) : Response.json({ fields: { status: { stringValue: 'accepted' } } });
            return Response.json({ fields: { displayName: { stringValue: '公開名' } } });
        }
        return realFetch(url, options);
    }) as typeof fetch;
    t.after(() => { globalThis.fetch = realFetch; });
    const served = await serve(); t.after(() => served.close());
    const sockets = [];
    for (const [index, visibility] of ['public', 'invite', 'invitePlus', 'friends', 'offline'].entries()) {
        const id = String(100001 + index), profileId = `target-${visibility}`;
        const { room, token: member } = createPlaza(id, { rules: { fruits: ['strawberry'] }, plaza: { name: '秘密の部屋名', visibility: visibility === 'offline' ? 'invite' : visibility } }, { name: '相手', profileId });
        await served.backend.create(room, 60_000);
        if (visibility !== 'offline') { const socket = await connect(served, id, member); await socket.until(() => true); sockets.push(socket); }
    }
    const location = (to: string) => served.call<ProfileLocation>('/rooms/location', { to }, { authorization: `Bearer ${token}` });
    assert.equal((await served.call('/rooms/location', { to: 'target-invite' })).status, 401);
    assert.equal((await location('stranger')).status, 403);
    assert.equal((await location('../bad')).status, 400);
    assert.deepEqual((await location('target-invite')).data, { kind: 'private', visibility: 'invite' });
    assert.deepEqual((await location('target-invitePlus')).data, { kind: 'private', visibility: 'invitePlus' });
    // Inaccessible friends-only rooms are also masked, rather than misreported as offline.
    assert.deepEqual((await location('target-friends')).data, { kind: 'private', visibility: 'friends' });
    assert.deepEqual((await location('target-offline')).data, { kind: 'offline' });
    assert.deepEqual((await location('reader')).data, { kind: 'offline' });
    const publicRoom = (await location('target-public')).data;
    assert.equal(publicRoom.kind, 'room');
    if (publicRoom.kind === 'room') assert.equal(publicRoom.room.id, '100001');
    // A named invitation makes even an invite room joinable, without exposing its invitation secret.
    const invited = (await served.backend.get('100002'))!;
    const previous = invited.version;
    invited.plaza!.allowed.push('reader'); invited.version++;
    assert.equal(await served.backend.replace(invited, previous, 60_000), true);
    const allowed = (await location('target-invite')).data;
    assert.equal(allowed.kind, 'room');
    if (allowed.kind === 'room') {
        assert.equal(allowed.room.id, '100002');
        assert.equal('invite' in allowed.room.plaza!, false);
    }
    await sockets[0].close();
    for (let attempt = 0; attempt < 20; attempt++) {
        const result = await location('target-public');
        if (result.data.kind === 'offline') break;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual((await location('target-public')).data, { kind: 'offline' });
});
