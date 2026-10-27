// The CPU of a plaza's table. A move of さいきょう can take a second to decide, so moves are decided
// in a worker thread and the rooms of this instance go on meanwhile. Should the worker fail or take
// too long, a quick level decides on this thread instead: the match never waits for nothing.
import { Worker } from 'node:worker_threads';
import { cpuCommand } from '@pplale/game-core';
import type { Catalog, Command, CpuLevel, GameState, Side } from '@pplale/game-core';

const TIMEOUT = 15_000;

export interface CpuThinker {
    /** The CPU's command for `side` (null: nothing to do). The dice are thrown at once. */
    think(state: GameState, level: CpuLevel, side: Side): Promise<Command | null>;
    close(): Promise<void>;
}

export function cpuThinker(catalog: Catalog): CpuThinker {
    let worker: Worker | null = null, serial = 0, closed = false;
    const waiting = new Map<number, { resolve: (command: Command | null) => void; timer: ReturnType<typeof setTimeout>; state: GameState; side: Side }>();
    const here = (state: GameState, level: CpuLevel, side: Side) => {
        try { return cpuCommand(state, catalog, { level: level === 'master' ? 'hard' : level, side }); } catch { return null; }
    };
    const fail = () => {
        worker = null;
        for (const [id, { resolve, timer, state, side }] of waiting) { clearTimeout(timer); waiting.delete(id); resolve(here(state, 'normal', side)); }
    };
    function start() {
        const started = new Worker(new URL('./cpu-worker.ts', import.meta.url));
        started.unref();
        started.on('message', ({ id, command }: { id: number; command: Command | null }) => {
            const asked = waiting.get(id);
            if (!asked) return;
            clearTimeout(asked.timer);
            waiting.delete(id);
            asked.resolve(command);
        });
        started.on('error', error => { console.error('cpu worker', error instanceof Error ? error.message : error); fail(); });
        // Only the worker in use fails its waiting moves; one given up has already answered them.
        started.on('exit', () => { if (worker === started) fail(); });
        return started;
    }
    return {
        think(state, level, side) {
            if (state.phase === 'dice') return Promise.resolve({ type: 'roll', actor: side });
            if (closed) return Promise.resolve(null);
            return new Promise(resolve => {
                try { worker ??= start(); } catch { return resolve(here(state, level, side)); }
                const id = ++serial;
                // A move that takes too long is given up, and the worker with it, so later moves do not queue behind it.
                const timer = setTimeout(() => {
                    waiting.delete(id);
                    resolve(here(state, 'easy', side));
                    // The moves queued behind it are decided here instead.
                    const stuck = worker;
                    fail();
                    void stuck?.terminate();
                }, TIMEOUT);
                waiting.set(id, { resolve, timer, state, side });
                worker.postMessage({ id, state, level, side });
            });
        },
        async close() {
            closed = true;
            for (const [id, { resolve, timer }] of waiting) { clearTimeout(timer); waiting.delete(id); resolve(null); }
            await worker?.terminate();
            worker = null;
        },
    };
}
