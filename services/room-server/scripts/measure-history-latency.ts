// Isolated local DB only. Measures the durable read/write path, excluding browser/network/animation.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { actingSides, legalMoves, newGame } from '@pplale/game-core';
import { catalog } from '../src/catalog.ts';
import { createRoom, joinRoom, act } from '../src/rooms.ts';
import { durableBackend } from '../src/history/backend.ts';
import { PostgresHistory } from '../src/history/postgres.ts';
import { deck, shared } from '../tests/helpers.ts';

const url = new URL(process.env.TEST_HISTORY_DATABASE_URL ?? '');
if (!url.pathname.includes('test')) throw new Error('Requires a dedicated test database');
const admin = new Pool({ connectionString: url.href });
const standbyNames = (await admin.query('SHOW synchronous_standby_names')).rows[0].synchronous_standby_names as string;
const database = `history_bench_${randomUUID().replaceAll('-', '')}`;
await admin.query(`CREATE DATABASE "${database}"`);
url.pathname = '/' + database;
const history = await PostgresHistory.open(url.href);
const redis = await shared().open();
const backend = await durableBackend(redis, history, { catalog, version: 'latency-bench', archiveImages: false });
const samples: { command: string; read: number; store: number; total: number }[] = [];
try {
    for (let match = 0; match < 4 && samples.length < 160; match++) {
        const { room: initial } = createRoom(String(900000 + match), { rules: { fruits: ['strawberry'], extendedPlayable: false } });
        joinRoom(initial, {});
        act(initial, 0, { action: 'ready', deck }, catalog);
        act(initial, 1, { action: 'ready', deck }, catalog);
        initial.state = newGame([deck, deck], catalog, initial.state!.rules, 42 + match);
        await backend.create(initial, 3_600_000);
        for (let step = 0; step < 120 && samples.length < 160; step++) {
            const start = performance.now();
            const room = (await backend.get(initial.id))!;
            const read = performance.now() - start;
            const state = room.state!;
            if (state.winner !== null) break;
            const moves = legalMoves(state, actingSides(state)[0], catalog);
            const picked = moves.find(m => m.command.type === 'keep')
                ?? moves.find(m => m.command.type === 'choose' && m.command.option === 'skip')
                ?? moves.find(m => m.command.type === 'attack')
                ?? moves.find(m => m.command.type === 'play') ?? moves[0];
            if (!picked) throw new Error('No legal command');
            act(room, picked.command.actor, { action: 'command', command: picked.command, revision: state.revision }, catalog);
            const expected = room.version++;
            const storing = performance.now();
            if (!await backend.replace(room, expected, 3_600_000)) throw new Error('Unexpected CAS conflict');
            samples.push({ command: picked.command.type, read, store: performance.now() - storing, total: performance.now() - start });
        }
    }
    const summarize = (values: number[]) => {
        const sorted = values.toSorted((a, b) => a - b);
        const at = (q: number) => Math.round((sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? 0) * 100) / 100;
        return { p50: at(.5), p95: at(.95), max: at(1) };
    };
    const report = {
        measuredAt: new Date().toISOString(), node: process.version, backend: redis.kind,
        conditions: { synchronousCommit: 'on', synchronousStandbyNames: standbyNames, seeds: '42 + match index', scope: 'Durable backend read, legal move selection, apply, store; excludes WebSocket, browser and animation' },
        samples: samples.length,
        commands: Object.fromEntries([...new Set(samples.map(s => s.command))].map(command => [command, samples.filter(s => s.command === command).length])),
        milliseconds: Object.fromEntries(['read', 'store', 'total'].map(stage => [stage, summarize(samples.map(s => s[stage as 'read' | 'store' | 'total']))])),
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
} finally {
    await backend.close();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
}
