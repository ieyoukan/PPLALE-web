import { parentPort } from 'node:worker_threads';
import { createMaster, createValueEvaluator, playMatch, valueModel } from '@pplale/game-core/ai';
import { selfPlayPositions, valueData } from '@pplale/game-core/train';
import { catalog } from './catalog.ts';
import type { Task } from './pool.ts';

parentPort!.on('message', (task: Task) => {
    if (task.kind === 'selfplay') {
        const { x, y, match } = valueData(task.seeds.flatMap(seed => {
            const sample = selfPlayPositions(catalog, seed, task.share);
            return sample ? [{ id: seed, ...sample }] : [];
        }));
        return parentPort!.postMessage({ x, y, match }, [x.buffer as ArrayBuffer, y.buffer as ArrayBuffer, match.buffer as ArrayBuffer]);
    }
    const candidate = createMaster({ evaluate: createValueEvaluator(task.candidate) });
    const base = createMaster({ evaluate: createValueEvaluator(valueModel) });
    let wins = 0;
    for (const seed of task.seeds) {
        // The same decks and shuffle in both seats, so luck cancels.
        if (playMatch(catalog, { levels: [candidate, base], seed }).winner === 0) wins++;
        if (playMatch(catalog, { levels: [base, candidate], seed }).winner === 1) wins++;
    }
    parentPort!.postMessage({ wins, matches: task.seeds.length * 2 });
});
