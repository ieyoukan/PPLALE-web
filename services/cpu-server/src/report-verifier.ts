import { Worker } from 'node:worker_threads';
import type { Catalog } from '@pplale/game-core';
import { HttpError } from '../../shared/http.mts';
import type { MatchRecord } from './report.ts';

type Result = MatchRecord | { error: string };
type Job = { body: unknown; resolve: (result: Result) => void; reject: (error: Error) => void };

/** A small bounded queue; /model and health checks stay responsive during replay. */
export class ReportVerifier {
    private worker: Worker | null = null;
    private active: Job | null = null;
    private queue: Job[] = [];
    private timer: ReturnType<typeof setTimeout> | undefined;
    private closed = false;
    private catalog: Catalog;
    private options: { timeoutMs?: number; maxWaiting?: number; workerUrl?: URL };
    constructor(catalog: Catalog, options: { timeoutMs?: number; maxWaiting?: number; workerUrl?: URL } = {}) {
        this.catalog = catalog; this.options = options;
    }

    verify(body: unknown): Promise<Result> {
        if (this.closed || this.active && this.queue.length >= (this.options.maxWaiting ?? 4))
            return Promise.reject(new HttpError(503, 'report verification busy'));
        return new Promise((resolve, reject) => {
            this.queue.push({ body, resolve, reject });
            this.next();
        });
    }

    private next() {
        if (this.active || this.closed || !this.queue.length) return;
        this.active = this.queue.shift()!;
        try {
            if (!this.worker) {
                const worker = new Worker(this.options.workerUrl ?? new URL('./report-worker.ts', import.meta.url), {
                    workerData: this.catalog, resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 8 },
                });
                this.worker = worker;
                worker.on('message', (result: Result) => {
                    if (this.worker !== worker) return;
                    clearTimeout(this.timer);
                    const job = this.active;
                    this.active = null;
                    job?.resolve(result);
                    this.next();
                });
                worker.on('error', () => { if (this.worker === worker) void this.fail(); });
                worker.on('exit', () => { if (this.worker === worker) void this.fail(); });
            }
            this.timer = setTimeout(() => { void this.fail(); }, this.options.timeoutMs ?? 5000);
            this.timer.unref();
            this.worker.postMessage(this.active.body);
        } catch { void this.fail(); }
    }

    private async fail() {
        clearTimeout(this.timer);
        const worker = this.worker;
        this.worker = null;
        const jobs = this.active ? [this.active, ...this.queue] : this.queue;
        this.active = null; this.queue = [];
        for (const job of jobs) job.reject(new HttpError(503, 'report verification unavailable'));
        await worker?.terminate();
    }

    async close() { this.closed = true; await this.fail(); }
}
