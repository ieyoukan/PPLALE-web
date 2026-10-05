// Worker threads for the two slow parts of a training run: self-play and the comparison matches.
import { Worker } from 'node:worker_threads';
import type { ValueModel } from '@pplale/game-core';

export type Task =
    | { kind: 'selfplay'; seeds: number[]; share: number }
    /** `candidate` against the built-in model on each seed, once in each seat. */
    | { kind: 'gate'; seeds: number[]; candidate: ValueModel };
export type Answer<T extends Task> = T extends { kind: 'selfplay' }
    ? { x: Float32Array; y: Uint8Array; match: Uint32Array }
    : { wins: number; matches: number };

/** Runs every task on `threads` workers and returns the answers (in no particular order). */
export async function runTasks<T extends Task>(tasks: T[], threads: number): Promise<Answer<T>[]> {
    const queue = [...tasks], answers: Answer<T>[] = [];
    const workers = Array.from({ length: Math.min(threads, tasks.length) }, () => new Worker(new URL('./worker.ts', import.meta.url)));
    try {
        await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => {
            const next = () => {
                const task = queue.shift();
                if (task) worker.postMessage(task); else resolve();
            };
            worker.on('message', (answer: Answer<T>) => { answers.push(answer); next(); });
            worker.on('error', reject);
            next();
        })));
    } finally {
        await Promise.all(workers.map(worker => worker.terminate()));
    }
    return answers;
}
