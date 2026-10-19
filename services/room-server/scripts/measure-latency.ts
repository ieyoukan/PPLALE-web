// A private local match over real WebSockets. REDIS_URL optionally selects an isolated Redis prefix.
// BENCH_COUNT_DELAY_MS simulates slow statistics storage; never connects players to a live room.
import { writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { actingSides, legalMoves } from '@pplale/game-core';
import type { Backend } from '../src/backend.ts';
import { catalog } from '../src/catalog.ts';
import { serve, shared, startedMatch } from '../tests/helpers.ts';

const countDelay = Number(process.env.BENCH_COUNT_DELAY_MS ?? 0);
// Stay inside the normal message budget; exclude this pacing from the measured round trip.
const interval = Number(process.env.BENCH_INTERVAL_MS ?? 120);
const source = await shared().open();
let collecting = false;
let stages: Record<string, number> = {};
const backend = new Proxy(source, {
    get(target, property: keyof Backend) {
        const value = target[property];
        if (typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
            const measured = collecting, measuredStages = stages, start = performance.now();
            if (property === 'count' && countDelay) await new Promise(resolve => setTimeout(resolve, countDelay));
            const result = await Reflect.apply(value, target, args);
            if (measured) measuredStages[property] = (measuredStages[property] ?? 0) + performance.now() - start;
            return result;
        };
    },
}) as Backend;
const served = await serve({ data: { open: () => backend }, beatSeconds: 3600 });
const samples: { command: string; roundTripMs: number; stages: Record<string, number> }[] = [];
try {
    for (let match = 0; match < 4 && samples.length < 160; match++) {
        const { id, sockets, command } = await startedMatch(served);
        for (let step = 0; step < 100 && samples.length < 160; step++) {
            const room = (await source.get(id))!;
            const state = room.state!;
            if (state.winner !== null) break;
            const side = actingSides(state)[0];
            const moves = legalMoves(state, side, catalog);
            const picked = moves.find(m => m.command.type === 'keep')
                ?? moves.find(m => m.command.type === 'choose' && m.command.option === 'skip')
                ?? moves.find(m => m.command.type === 'attack')
                ?? moves.find(m => m.command.type === 'play') ?? moves[0];
            if (!picked) throw new Error('No legal command');
            await sockets[side].until(view => view.game?.revision === state.revision);
            await pause(interval);
            stages = {};
            collecting = true;
            const start = performance.now();
            const error = await command(side, picked.command as Parameters<typeof command>[1]);
            const roundTripMs = performance.now() - start;
            collecting = false;
            if (error) throw new Error(error);
            if (state.phase === 'playing') samples.push({ command: picked.command.type, roundTripMs, stages: { ...stages } });
        }
        // Keep sockets open until shutdown so presence callbacks cannot race closing Redis.
    }
    const summarize = (values: number[]) => {
        const sorted = values.toSorted((a, b) => a - b);
        return { count: sorted.length, p50: sorted[Math.max(0, Math.ceil(sorted.length * .5) - 1)] ?? 0, p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0, max: sorted.at(-1) ?? 0 };
    };
    const report = {
        measuredAt: new Date().toISOString(), node: process.version, backend: source.kind,
        conditions: { network: 'local loopback WebSocket; not production latency', simulatedStatisticsDelayMs: countDelay, intervalMs: interval, statistics: 'timed backend calls may overlap; stage times must not be added', samples: samples.length },
        roundTripMs: summarize(samples.map(s => s.roundTripMs)),
        byCommand: Object.fromEntries([...new Set(samples.map(s => s.command))].map(command => [command, summarize(samples.filter(s => s.command === command).map(s => s.roundTripMs))])),
        backendMs: Object.fromEntries([...new Set(samples.flatMap(s => Object.keys(s.stages)))].map(stage => [stage, summarize(samples.map(s => s.stages[stage] ?? 0))])),
        serverLatency: (await served.server.stats()).latency,
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
} finally { await served.close(); }
