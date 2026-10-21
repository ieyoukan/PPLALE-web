import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyCommand, legalMoves } from '@pplale/game-core';
import type { HistoryPage, MatchRecording } from '@pplale/game-core/history';
import type { Seated } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import { createRoom, joinRoom, act, tidy } from '../src/rooms.ts';
import { durableBackend } from '../src/history/backend.ts';
import { captureState } from '../src/history/capture.ts';
import { PostgresHistory } from '../src/history/postgres.ts';
import { verifyHistoryDatabase } from '../scripts/verify-history.ts';
import { connect, deck, serve } from './helpers.ts';
import { fixture, store, historyAvailable } from './history-helpers.ts';
const historyTest = (name: string, fn: (t: TestContext) => Promise<void>) => test(name, { skip: !historyAvailable }, fn);

function ready(id = '123456') {
    const { room } = createRoom(id, { rules: { fruits: ['strawberry'], extendedPlayable: false } });
    joinRoom(room, {});
    room.seats[0].historyOwners = ['device:host', 'user:host'];
    room.seats[1]!.historyOwners = ['device:guest'];
    act(room, 0, { action: 'ready', deck }, catalog);
    act(room, 1, { action: 'ready', deck }, catalog);
    return room;
}

historyTest('history: all accepted random actions have exact immutable frames; rejected actions and CAS losers add nothing', async t => {
    const { history, backend } = await fixture(t);
    const room = ready();
    assert.equal(await backend.create(room, 3_600_000), true);
    const first = structuredClone(room.state!);
    let accepted = 0;
    for (; accepted < 180 && room.status === 'playing'; accepted++) {
        const state = room.state!;
        const side = state.pending?.task.actor ?? state.active;
        const moves = legalMoves(state, side, catalog).length ? legalMoves(state, side, catalog) : legalMoves(state, (1 - side) as 0 | 1, catalog);
        assert.ok(moves.length, `moves at ${state.phase}`);
        const command = moves[(accepted * 17 + 3) % moves.length].command;
        act(room, command.actor, { action: 'command', command, revision: state.revision }, catalog);
        await store(backend, room);
    }
    if (room.status === 'playing') { act(room, 1, { action: 'resign' }, catalog); await store(backend, room); }
    const recording = (await history.recording(['device:host'], room.record!.id))!;
    assert.ok(recording.match.complete);
    assert.equal(recording.match.engineVersion, 'frozen-engine-v1');
    assert.deepEqual(recording.frames[0].state, first);
    assert.deepEqual(recording.frames.at(-1)!.state, JSON.parse(JSON.stringify(room.state)));
    assert.equal(recording.frames.length, accepted + 1 + (room.record?.reason === 'resign' ? 1 : 0));
    for (let index = 1; index < recording.frames.length; index++) {
        const frame = recording.frames[index];
        if (!frame.command) continue;
        const result = applyCommand(recording.frames[index - 1].state, frame.command, recording.catalog);
        assert.equal(result.error, undefined);
        assert.deepEqual(JSON.parse(JSON.stringify(result.state)), frame.state, `exact state at frame ${index}`);
    }
    const stale = structuredClone(room);
    assert.equal(await backend.replace(stale, room.version - 1, 1000), false);
    assert.deepEqual(await history.recording(['device:host'], room.record!.id), recording);
    assert.equal(await history.recording(['device:stranger'], room.record!.id), null);
});

historyTest('history API: only participants can read completed decks, favorites persist, headers and account tokens are validated', async t => {
    const { history, backend, onClose } = await fixture(t);
    const served = await serve({ history, data: { open: () => backend } }); onClose(() => served.close());
    const host = { 'x-history-key': 'a'.repeat(64) }, guest = { 'x-history-key': 'b'.repeat(64) }, stranger = { 'x-history-key': 'c'.repeat(64) };
    const a = (await served.call<Seated>('/rooms', { rules: { fruits: ['strawberry'] } }, host)).data;
    const b = (await served.call<Seated>(`/rooms/${a.view.id}/join`, {}, guest)).data;
    const x = await connect(served, a.view.id, a.token), y = await connect(served, b.view.id, b.token);
    await x.act({ action: 'ready', deck }); await y.act({ action: 'ready', deck });
    const room = (await history.get(a.view.id))!;
    assert.equal((await served.call(`/history/${room.record!.id}`, {}, host)).status, 404);
    assert.equal(JSON.stringify(x.latest()).includes('historyOwners'), false);
    await y.act({ action: 'resign' });
    const page = await served.call<HistoryPage>('/history/list', {}, host);
    assert.equal(page.data.entries.length, 1);
    assert.equal((await served.call(`/history/${room.record!.id}`, {}, stranger)).status, 404);
    const replay = await served.call<MatchRecording>(`/history/${room.record!.id}`, {}, guest);
    assert.equal(replay.data.match.seat, 1); assert.deepEqual(replay.data.match.players[0].deck, deck);
    assert.equal(JSON.stringify(replay.data).includes('device:'), false);
    assert.equal((await served.call(`/history/${room.record!.id}/favorite`, { value: true }, host)).status, 200);
    assert.equal((await served.call<HistoryPage>('/history/list', { favorites: true }, host)).data.entries.length, 1);
    assert.equal((await served.call('/history/list', {}, {})).status, 401);
    assert.equal((await served.call('/history/list', {}, { ...host, authorization: 'Bearer forged' })).status, 401);
    assert.equal((await served.call('/history/list', {}, { 'x-history-key': 'bad' })).status, 400);
});

historyTest('history: automatic disconnect is captured even with no browser waiting for the result', async t => {
    const { history, backend } = await fixture(t);
    const room = ready(); room.mode = 'free'; await backend.create(room, 3_600_000);
    const now = Date.now(); tidy(room, [true, false], now, { lobby: 600000, match: 1800000 });
    assert.equal(tidy(room, [true, false], now + 61_000, { lobby: 600000, match: 1800000 }), 'finished');
    await store(backend, room);
    const recording = (await history.recording(['device:guest'], room.record!.id))!;
    assert.equal(recording.match.reason, 'disconnect'); assert.equal(recording.match.winner, 0);
    assert.deepEqual(recording.frames.at(-1)!.state, JSON.parse(JSON.stringify(room.state)));
});

historyTest('history: free matchmaking queue and both recordings commit atomically under concurrent requests', async t => {
    const { history, backend } = await fixture(t);
    const { freeMatch } = await import('../src/matchmaking.ts');
    const options = { maxRooms: 100, roomTtl: 3_600_000, mayStart: () => true };
    await freeMatch(backend, catalog, 'start', { token: 'a'.repeat(64), name: 'A', deck }, { ...options, owners: ['device:host'] });
    const results = await Promise.all(['b', 'c'].map(letter => freeMatch(backend, catalog, 'start', { token: letter.repeat(64), name: letter, deck }, { ...options, owners: [`device:${letter}`] })));
    assert.equal(results.filter(result => result.status.status === 'matched').length, 1);
    const ids = await backend.ids(); assert.equal(ids.length, 1);
    const room = (await history.get(ids[0]))!;
    assert.ok(room.record);
    act(room, 0, { action: 'resign' }, catalog); await store(backend, room);
    const page = await history.list(['device:host']);
    assert.equal(page.entries.length, 1); assert.equal(page.entries[0].mode, 'free');
    assert.equal((await history.recording(['device:host'], room.record!.id))!.frames.length, 2);
});

historyTest('history: pagination and favorite filtering never delete older recordings', async t => {
    const { history, backend } = await fixture(t);
    for (let index = 0; index < 34; index++) {
        const room = ready(String(index).padStart(6, '0')); await backend.create(room, 3_600_000);
        act(room, 0, { action: 'resign' }, catalog); await store(backend, room);
        if (index % 2 === 0) await history.favorite(['device:host'], room.record!.id, true);
    }
    const first = await history.list(['device:host']);
    assert.equal(first.entries.length, 30); assert.ok(first.cursor);
    const second = await history.list(['device:host'], first.cursor!);
    assert.equal(second.entries.length, 4); assert.equal(second.cursor, null);
    assert.equal(new Set([...first.entries, ...second.entries].map(entry => entry.id)).size, 34);
    assert.equal((await history.list(['device:host'], undefined, true)).entries.length, 17);
});

historyTest('history: archive failure leaves a durable Redis outbox, never acknowledges; another pod recovers exactly once', async t => {
    const { history, backend, redis, pool, url, onClose } = await fixture(t);
    const room = ready(); await backend.create(room, 3_600_000);
    const before = structuredClone(room);
    await pool.query(`CREATE FUNCTION reject_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated archive failure'; END $$;
        CREATE TRIGGER reject_history BEFORE INSERT ON frames FOR EACH ROW EXECUTE FUNCTION reject_history();`);
    act(room, 0, { action: 'resign' }, catalog);
    await assert.rejects(store(backend, room), /simulated archive failure/);
    assert.deepEqual(await history.get(room.id), JSON.parse(JSON.stringify(before)));
    assert.equal((await redis.historyPending()).length, 1);
    assert.equal((await history.list(['device:host'])).entries.length, 0);
    await pool.query('DROP TRIGGER reject_history ON frames');
    const replacement = await PostgresHistory.open(url);
    const next = await durableBackend(redis, replacement, { catalog, version: 'replacement', archiveImages: false });
    onClose(() => next.close());
    assert.equal((await redis.historyPending()).length, 0);
    const recording = (await history.recording(['device:host'], room.record!.id))!;
    assert.equal(recording.frames.length, 2); assert.equal(recording.match.complete, true);
    assert.deepEqual(recording.frames[1].state, JSON.parse(JSON.stringify(room.state)));
});

historyTest('history: old and new pods share new rooms and the free queue throughout rolling updates', async t => {
    const { backend, redis, history } = await fixture(t);
    await redis.beat('old-pod', 0, 60_000);
    const room = ready(); await backend.create(room, 3_600_000);
    assert.deepEqual(await redis.get(room.id), JSON.parse(JSON.stringify(room)));
    const oldView = (await redis.get(room.id))!;
    act(oldView, 0, { action: 'command', command: { type: 'roll', actor: 0 }, revision: 0 }, catalog);
    const expected = oldView.version++;
    assert.equal(await redis.replace(oldView, expected, 3_600_000), true);
    const newView = (await backend.get(room.id))!;
    assert.equal(newView.state!.revision, 1);
    act(newView, 1, { action: 'resign' }, catalog); await store(backend, newView);
    const recording = (await history.recording(['device:host'], room.record!.id))!;
    assert.equal(recording.match.complete, false);
    await redis.forget('old-pod');
    const fresh = ready('654321'); await backend.create(fresh, 3_600_000);
    act(fresh, 0, { action: 'resign' }, catalog); await store(backend, fresh);
    assert.equal((await history.recording(['device:host'], fresh.record!.id))!.match.complete, true);
    const queue = { version: 1, entries: {} };
    assert.equal(await backend.replaceFreeMatchQueue(queue, 0), true);
    assert.deepEqual(await redis.freeMatchQueue(), queue);
});

historyTest('history: expiry, room id reuse and rematch never replace a previous recording', async t => {
    const { backend, history } = await fixture(t);
    const old = ready(); await backend.create(old, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(await history.get(old.id), null);
    const interrupted = (await history.list(['device:host'])).entries[0];
    assert.equal(interrupted.reason, 'abandoned'); assert.equal(interrupted.complete, false);
    const next = ready(); await backend.create(next, 3_600_000);
    act(next, 1, { action: 'resign' }, catalog); await store(backend, next);
    const recording = await history.recording(['device:host'], next.record!.id);
    act(next, 0, { action: 'rematch' }, catalog); await store(backend, next);
    assert.deepEqual(await history.recording(['device:host'], recording!.match.id), recording);
    assert.equal((await history.list(['device:host'])).entries.length, 2);
});

historyTest('history: card catalogs, engine version and presentation remain frozen across updates', async t => {
    const { redis, history } = await fixture(t);
    const room = ready(), changed = structuredClone(catalog);
    changed.p_1.name = 'changed after the first frame';
    const a = await history.registerCatalog(catalog), b = await history.registerCatalog(changed);
    await redis.create(room, 3_600_000, { snapshot: captureState(room.state!, catalog, a, 'old-engine'), completeAllowed: true });
    for (const write of await redis.historyPending()) { await history.ingest(write); await redis.historyAck(write.id); }
    act(room, 0, { action: 'resign' }, catalog); const expected = room.version++;
    const next = captureState(room.state!, changed, b, 'new-engine');
    next.presentation.cards[Object.keys(room.state!.cards)[0]].attack = 987;
    await redis.replace(room, expected, 3_600_000, { snapshot: next, completeAllowed: true });
    for (const write of await redis.historyPending()) { await history.ingest(write); await history.ingest(write); await redis.historyAck(write.id); }
    const recording = (await history.recording(['device:host'], room.record!.id))!;
    assert.equal(recording.frames.length, 2);
    assert.equal(recording.frames[0].engineVersion, 'old-engine'); assert.equal(recording.frames[1].engineVersion, 'new-engine');
    assert.equal(recording.catalogs[a].p_1.name, catalog.p_1.name); assert.equal(recording.catalogs[b].p_1.name, changed.p_1.name);
    assert.equal(recording.frames[1].presentation.cards[Object.keys(room.state!.cards)[0]].attack, 987);
});

historyTest('history: corruption of a frame, metadata or archived image fails closed', async t => {
    const { backend, history, pool, url } = await fixture(t);
    const room = ready(); await backend.create(room, 3_600_000);
    act(room, 0, { action: 'resign' }, catalog); await store(backend, room);
    assert.equal((await verifyHistoryDatabase(url)).frames, 2);
    const bytes = Buffer.from('original card bytes'), id = createHash('sha256').update(bytes).digest('hex');
    await history.putAsset(id, bytes.toString('base64'), 'image/webp');
    await assert.rejects(history.putAsset(id, Buffer.from('replacement').toString('base64'), 'image/webp'), /Invalid/);
    await pool.query("UPDATE assets SET data=$1 WHERE id=$2", [Buffer.from('corrupt'), id]);
    await assert.rejects(history.asset(id), /integrity/);
    await pool.query("UPDATE frames SET previous='broken' WHERE match=$1 AND seq=1", [room.record!.id]);
    await assert.rejects(history.recording(['device:host'], room.record!.id), /integrity/);
    await pool.query("UPDATE matches SET meta='{}' WHERE id=$1", [room.record!.id]);
    await assert.rejects(history.list(['device:host']), /integrity/);
});

historyTest('history: command appends still check catalog integrity and retry an unacknowledged write', async t => {
    const { backend, redis, history, pool } = await fixture(t);
    const room = ready(); await backend.create(room, 3_600_000);
    const id = (await pool.query('SELECT catalog FROM matches WHERE id=$1', [room.record!.id])).rows[0].catalog;
    const original = (await pool.query('SELECT data FROM catalogs WHERE id=$1', [id])).rows[0].data;
    await pool.query('UPDATE catalogs SET data=$1 WHERE id=$2', [Buffer.from('corrupt'), id]);
    act(room, 0, { action: 'command', command: { type: 'roll', actor: 0 }, revision: 0 }, catalog);
    await assert.rejects(store(backend, room), /Catalog integrity/);
    assert.equal((await history.get(room.id))!.state!.revision, 0);
    assert.equal((await redis.historyPending()).length, 1);
    await pool.query('UPDATE catalogs SET data=$1 WHERE id=$2', [original, id]);
    assert.equal((await backend.get(room.id))!.state!.revision, 1);
    assert.equal((await redis.historyPending()).length, 0);
});

historyTest('history: claiming guest history preserves favorites, excludes a second account and allows new guest matches after logout', async t => {
    const { backend, history } = await fixture(t);
    const room = ready(); room.seats[0].historyOwners = ['device:host']; await backend.create(room, 3_600_000);
    act(room, 1, { action: 'resign' }, catalog); await store(backend, room);
    await history.favorite(['device:host'], room.record!.id, true);
    await history.linkGuest(['device:host', 'user:alice']);
    assert.equal((await history.list(['user:alice'])).entries[0].favorite, true);
    assert.equal((await history.list(['device:host'])).entries.length, 0);
    await history.linkGuest(['device:host', 'user:bob']);
    assert.equal((await history.list(['user:bob'])).entries.length, 0);
    await new Promise(resolve => setTimeout(resolve, 5));
    const next = ready('654321'); next.seats[0].historyOwners = ['device:host']; await backend.create(next, 3_600_000);
    act(next, 1, { action: 'resign' }, catalog); await store(backend, next);
    assert.equal((await history.list(['device:host'])).entries.length, 1);
    await history.linkGuest(['device:host', 'user:bob']);
    assert.equal((await history.list(['user:bob'])).entries.length, 1);
    assert.equal((await history.list(['user:alice'])).entries.length, 1);
});

historyTest('history: a slow backup snapshot cannot stall room commands or HTTP health', async t => {
    const { backend, pool, history, onClose } = await fixture(t);
    const served = await serve({ history, data: { open: () => backend }, beatSeconds: 60 }); onClose(() => served.close());
    const room = ready(); await backend.create(room, 3_600_000);
    const backup = await pool.connect();
    try {
        await backup.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await backup.query('SELECT * FROM matches');
        const slow = backup.query('SELECT pg_sleep(1.5)');
        const before = Date.now();
        act(room, 0, { action: 'resign' }, catalog); await store(backend, room);
        assert.equal((await served.call('/healthz')).status, 200);
        assert.ok(Date.now() - before < 1000, 'room action waited for backup');
        await slow; await backup.query('ROLLBACK');
    } finally { backup.release(); }
});

historyTest('history: reconnect repairs a Redis AOF rollback using the acknowledged PostgreSQL room', async t => {
    const { backend, redis, history } = await fixture(t);
    const room = ready(); await backend.create(room, 3_600_000);
    const before = structuredClone(room);
    act(room, 0, { action: 'command', command: { type: 'roll', actor: 0 }, revision: 0 }, catalog); await store(backend, room);
    assert.equal(await redis.replace(before, room.version, 3_600_000), true);
    assert.equal((await redis.get(room.id))!.state!.revision, 0);
    assert.equal((await backend.get(room.id))!.state!.revision, 1);
    assert.equal((await history.get(room.id))!.state!.revision, 1);
    assert.equal((await redis.historyPending()).length, 0);
});
