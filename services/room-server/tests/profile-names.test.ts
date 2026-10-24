import test from 'node:test';
import assert from 'node:assert/strict';
import { profileNames, readPublicName } from '../src/profile-names.ts';
import { createRoom, joinRoom, seatView } from '../src/rooms.ts';
import { arena } from '../../../packages/game-core/tests/helpers.mjs';
import type { MatchRecording } from '@pplale/game-core/history';

test('public names: existing rooms, state, logs and host use the current profile; guests keep their chosen names', async () => {
    const resolver = profileNames(async () => '現在の公開名');
    const { room } = createRoom('123456', { name: '旧アカウント名', rules: { fruits: ['strawberry'] } });
    joinRoom(room, { name: 'ゲストの名前' });
    room.seats[0]!.profileId = 'verified-uid';
    room.state = arena();
    room.state.players[0]!.name = '旧アカウント名';
    room.state.players[1].name = 'ゲストの名前';
    room.state.log = ['旧アカウント名のダイス：6', '旧アカウント名が先攻を選びました', '旧アカウント名の1ターン目', '旧アカウント名：「カード」をプレイ', '旧アカウント名が投了しました', 'カード「旧アカウント名」をプレイ'];
    const original = structuredClone(room);
    const view = seatView(room, 0, { online: [true, true], watching: 0 });
    assert.equal(resolver.view(view).players[0]!.name, 'プレイヤー');
    const result = await resolver.response({ view }) as { view: typeof view };
    assert.equal(result.view.players[0]!.name, '現在の公開名');
    assert.equal(result.view.players[1]!.name, 'ゲストの名前');
    assert.equal(result.view.game!.players[0]!.name, '現在の公開名');
    assert.ok(result.view.game!.log.slice(0, 5).every(line => line.startsWith('現在の公開名')));
    assert.equal(result.view.game!.log[5], 'カード「旧アカウント名」をプレイ');
    assert.deepEqual(room, original);
    assert.deepEqual(await resolver.response({ host: '旧アカウント名', hostProfileId: 'verified-uid' }), { host: '現在の公開名', hostProfileId: 'verified-uid' });
});

test('public names: old public replays, lists and free-match activity resolve by UID without modifying the archive', async () => {
    let current = '新しい公開名', now = 1, reads = 0;
    const resolver = profileNames(async () => { reads++; return current; }, () => now);
    const game = arena(); game.players[0]!.name = '旧名[.*]'; game.players[1].name = 'ゲスト';
    game.log = ['旧名[.*]：初期手札を2枚交換'];
    const match = { players: [{ name: 'もっと古い名前', profileId: 'uid' }, { name: 'ゲスト' }] };
    const recording = { match, frames: [{ state: game, hash: 'archive-hash', previousHash: '' }] } as unknown as MatchRecording;
    const original = structuredClone(recording);
    const output = await resolver.response(recording) as MatchRecording;
    assert.equal(JSON.stringify(output).includes('旧名'), false);
    assert.equal(JSON.stringify(output).includes('もっと古い名前'), false);
    assert.equal(output.frames[0].hash, 'archive-hash');
    assert.equal(output.publicNamesResolved, true);
    assert.deepEqual(recording, original);
    await resolver.response({ entries: [match] });
    await resolver.response({ waiting: match.players, matches: [match] });
    assert.equal(reads, 1);
    now += 60_001; current = '変更後の公開名';
    const changed = await resolver.response(recording) as MatchRecording;
    assert.equal(changed.match.players[0]!.name, current);
    assert.equal(changed.frames[0].state.players[0]!.name, current);
    assert.equal(reads, 2);
});

test('public names: identical historical names do not misattribute old text logs to one player', async () => {
    const resolver = profileNames(async uid => uid === 'first' ? '公開名A' : '公開名B');
    const game = arena(); game.players.forEach(player => { player.name = '昔の同名'; });
    game.log = ['昔の同名：お菓子カードを1枚ドロー'];
    const recording = { match: { players: [{ name: '昔の同名', profileId: 'first' }, { name: '昔の同名', profileId: 'second' }] }, frames: [{ state: game }] };
    const output = await resolver.response(recording) as MatchRecording;
    assert.deepEqual(output.match.players.map(player => player.name), ['公開名A', '公開名B']);
    assert.equal(output.frames[0].state.log[0], 'プレイヤー：お菓子カードを1枚ドロー');
});

test('public names: a new match refreshes the profile even inside the cache lifetime', async () => {
    let current = '変更前';
    const resolver = profileNames(async () => current);
    await resolver.load('uid');
    current = '変更後';
    await resolver.load('uid', true);
    assert.equal(resolver.name({ name: '提出した別名', profileId: 'uid' }), '変更後');
});

test('public names: profile outages and invalid ids cannot restore the stored account name', async () => {
    const resolver = profileNames(async () => { throw new Error('offline'); });
    const result = await resolver.response({ entries: [{ players: [{ name: '非公開の旧名', profileId: 'uid' }, { name: '別の非公開名', profileId: '../invalid' }] }] });
    assert.equal(JSON.stringify(result).includes('非公開'), false);
});

test('public names: sockets return immediately while the cache deduplicates and bounds slow reads', async () => {
    let complete!: (name: string) => void, reads = 0;
    const resolver = profileNames(() => { reads++; return new Promise<string>(resolve => { complete = resolve; }); });
    const load = resolver.load('uid');
    for (let i = 0; i < 100; i++) assert.equal(resolver.name({ name: '旧名', profileId: 'uid' }), 'プレイヤー');
    assert.equal(reads, 1);
    complete('公開名'); await load;
    assert.equal(resolver.name({ name: '旧名', profileId: 'uid' }), '公開名');
    const blocked = profileNames(() => { reads++; return new Promise<string>(() => {}); });
    reads = 0;
    for (let i = 0; i < 100; i++) blocked.name({ name: '旧名', profileId: `uid${i}` });
    assert.equal(reads, 8);
});

test('public names: REST reads only the profile displayName and ignores account fields', async t => {
    const oldFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = oldFetch; });
    globalThis.fetch = (async (url: string, options: RequestInit) => {
        assert.ok(url.endsWith('/profiles/public-uid?mask.fieldPaths=displayName'));
        assert.equal(options.headers, undefined);
        return Response.json({ fields: { displayName: { stringValue: '公開名' }, email: { stringValue: 'private@example.invalid' }, name: { stringValue: '本名' } } });
    }) as typeof fetch;
    assert.equal(await readPublicName('public-uid'), '公開名');
});

test('public names: HTTP intake verifies identity and overrides aliases; HTTP and sockets never send the old name', async t => {
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const { serve, connect } = await import('./helpers.ts');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...await exportJWK(publicKey), kid: 'profile-test-key', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('verified-profile').setIssuedAt().setExpirationTime('5m').setIssuer('https://securetoken.google.com/pplale-6cca0').setAudience('pplale-6cca0').sign(privateKey);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
        const address = String(url);
        if (address.includes('www.googleapis.com/service_accounts/v1/jwk/')) return Response.json({ keys: [jwk] });
        if (address.includes('firestore.googleapis.com/')) return Response.json({ fields: { displayName: { stringValue: '統一した公開名' } } });
        return oldFetch(url, options);
    }) as typeof fetch;
    t.after(() => { globalThis.fetch = oldFetch; });
    const served = await serve(); t.after(() => served.close());
    const created = await served.call<import('@pplale/game-core/room').Seated>('/rooms', { name: 'アカウントの本名', profileId: 'spoofed-uid', rules: { fruits: ['strawberry'] } }, { authorization: `Bearer ${token}` });
    assert.equal(created.status, 200);
    assert.equal(created.data.view.players[0]!.name, '統一した公開名');
    assert.equal(created.data.view.players[0]!.profileId, 'verified-profile');
    const id = created.data.view.id;
    const room = (await served.backend.get(id))!;
    room.seats[0]!.name = '過去の本名';
    await served.backend.replace(room, room.version, 60_000);
    const response = await served.call(`/rooms/${id}`);
    assert.equal(JSON.stringify(response).includes('過去の本名'), false);
    assert.ok(JSON.stringify(response).includes('統一した公開名'));
    const socket = await connect(served, id, created.data.token);
    const view = await socket.until(() => true);
    assert.equal(view.players[0]!.name, '統一した公開名');
    assert.equal(JSON.stringify(view).includes('過去の本名'), false);
    await socket.close();
    const bad = await served.call('/rooms', { name: '勝手な名前', rules: { fruits: ['strawberry'] } }, { authorization: 'Bearer invalid' });
    assert.equal(bad.status, 401);
});
