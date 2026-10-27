import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { fixture, store } from './history-helpers.ts';
import { PostgresHistory } from '../src/history/postgres.ts';
import { createRoom, joinRoom, act } from '../src/rooms.ts';
import { deck } from './helpers.ts';
import { catalog } from '../src/catalog.ts';

test('history: synchronous replication never acknowledges a write until the standby applies it', { skip: !process.env.TEST_HISTORY_STANDBY_DATABASE_URL }, async t => {
    const { backend, url, pool, onClose } = await fixture(t);
    const { room } = createRoom('123456', { rules: { fruits: ['strawberry'] } }); joinRoom(room, {});
    room.seats[0]!.historyOwners = ['device:host']; room.seats[1]!.historyOwners = ['device:guest'];
    act(room, 0, { action: 'ready', deck }, catalog); act(room, 1, { action: 'ready', deck }, catalog);
    await backend.create(room, 3_600_000);
    act(room, 1, { action: 'resign' }, catalog); await store(backend, room);
    const history = await PostgresHistory.open(url, 'remote_apply');
    const standbyUrl = new URL(process.env.TEST_HISTORY_STANDBY_DATABASE_URL!); standbyUrl.pathname = new URL(url).pathname;
    const standby = new Pool({ connectionString: standbyUrl.href });
    onClose(async () => { await history.close(); await standby.end(); });
    let acknowledged = false;
    await standby.query('SELECT pg_wal_replay_pause()');
    const write = history.favorite(['device:host'], room.record!.id, true).then(() => { acknowledged = true; });
    try {
        await new Promise(resolve => setTimeout(resolve, 400));
        assert.equal(acknowledged, false);
        // Wait until the transaction reaches synchronous COMMIT, independent of machine load.
        let visible = false;
        for (let attempt = 0; attempt < 150; attempt++) {
            if ((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='pplale_history' AND wait_event='SyncRep'")).rowCount) { visible = true; break; }
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(visible, true); assert.equal(acknowledged, false);
        assert.equal((await standby.query('SELECT MAX(favorite) AS value FROM members')).rows[0].value, 0);
    } finally { await standby.query('SELECT pg_wal_replay_resume()'); }
    await write;
    assert.equal(acknowledged, true);
    assert.equal((await standby.query('SELECT MAX(favorite) AS value FROM members')).rows[0].value, 1);
});
