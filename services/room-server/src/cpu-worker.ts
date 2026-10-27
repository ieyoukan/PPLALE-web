// Decides a CPU move for cpu.ts, away from the thread that serves the rooms.
import { parentPort } from 'node:worker_threads';
import { cpuCommand } from '@pplale/game-core';
import type { CpuLevel, GameState, Side } from '@pplale/game-core';
import { catalog } from './catalog.ts';

parentPort!.on('message', ({ id, state, level, side }: { id: number; state: GameState; level: CpuLevel; side: Side }) => {
    let command = null;
    try { command = cpuCommand(state, catalog, { level, side }); } catch (error) { console.error('cpu failed', error instanceof Error ? error.message : error); }
    parentPort!.postMessage({ id, command });
});
