import { parentPort } from 'node:worker_threads';
import { createMaster, createValueEvaluator, playMatch } from '@pplale/game-core/ai';
import { selfPlayPositions, environmentDecks, valueData } from '@pplale/game-core/train';
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
    const champion = createMaster({ evaluate: createValueEvaluator(task.champion) });
    let wins = 0, matches = 0;
    for (const seed of task.seeds) {
        // The same decks and shuffle in both seats, so luck cancels; decks of every environment.
        // A match without a winner counts for neither.
        const decks = environmentDecks(catalog, seed);
        for (const [levels, seat] of [[[candidate, champion], 0], [[champion, candidate], 1]] as const) {
            const { winner } = playMatch(catalog, { levels: [...levels], seed, decks });
            if (winner === 0 || winner === 1) { matches++; if (winner === seat) wins++; }
        }
    }
    parentPort!.postMessage({ wins, matches });
});
