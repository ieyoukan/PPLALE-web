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

/**
 * Runs the tasks on `threads` workers and returns the answers (in no particular order).
 * `enough` is asked after every answer; once it says yes, the tasks still waiting or running are dropped.
 */
export async function runTasks<T extends Task>(tasks: T[], threads: number, enough?: (answers: Answer<T>[]) => boolean): Promise<Answer<T>[]> {
    const queue = [...tasks], answers: Answer<T>[] = [];
    const workers = Array.from({ length: Math.min(threads, tasks.length) }, () => new Worker(new URL('./worker.ts', import.meta.url)));
    try {
        await new Promise<void>((resolve, reject) => {
            let working = workers.length, stopped = false;
            for (const worker of workers) {
                const next = () => {
                    const task = queue.shift();
                    if (task) worker.postMessage(task);
                    else if (--working === 0) resolve();
                };
                worker.on('message', (answer: Answer<T>) => {
                    if (stopped) return;
                    answers.push(answer);
                    if (enough?.(answers)) {
                        stopped = true;
                        return resolve();
                    }
                    next();
                });
                worker.on('error', reject);
                next();
            }
            if (!workers.length) resolve();
        });
    } finally {
        await Promise.all(workers.map(worker => worker.terminate()));
    }
    return answers;
}
