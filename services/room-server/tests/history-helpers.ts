import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { PostgresHistory } from '../src/history/postgres.ts';
import { durableBackend } from '../src/history/backend.ts';
import { catalog } from '../src/catalog.ts';
import { shared } from './helpers.ts';
import type { Backend } from '../src/backend.ts';
import type { Room } from '../src/rooms.ts';

export const historyAvailable = !!process.env.TEST_HISTORY_DATABASE_URL;
export async function fixture(t: TestContext) {
    const base = new URL(process.env.TEST_HISTORY_DATABASE_URL!);
    if (!base.pathname.includes('test')) throw new Error('History tests require a dedicated test database');
    const admin = new Pool({ connectionString: base.href });
    const name = `history_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    base.pathname = '/' + name;
    const url = base.href, pool = new Pool({ connectionString: url });
    pool.on('error', () => {});
    const history = await PostgresHistory.open(url);
    const redis = await shared().open();
    const backend = await durableBackend(redis, history, { catalog, version: 'frozen-engine-v1', archiveImages: false });
    const cleanup: (() => Promise<void>)[] = [];
    const onClose = (close: () => Promise<void>) => { cleanup.push(close); };
    t.after(async () => { for (const close of cleanup.reverse()) await close(); await backend.close(); await pool.end(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.end(); });
    return { history, redis, backend, pool, url, onClose };
}
export async function store(backend: Backend, room: Room, ttl = 3_600_000) {
    const expected = room.version++;
    if (!await backend.replace(room, expected, ttl)) throw new Error('Test CAS unexpectedly failed');
}
