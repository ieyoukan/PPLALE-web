import { summarizeByKind, summarizePlays } from '@pplale/game-core/performance';
import type { PlayPerformance, PlaySample } from '@pplale/game-core/performance';
import type { Backend } from './backend.ts';

export const PERFORMANCE_CAPACITY = 2048;
export const PERFORMANCE_TTL = 24 * 60 * 60 * 1000;
/** A bounded, lossy diagnostic queue. Its I/O is never awaited by a room action. */
export function playPerformance(backend: Pick<Backend, 'appendPerformance' | 'readPerformance' | 'kind'>) {
    let pending: PlaySample[] = [], writing = false, stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reading: Promise<PlaySample[]> | undefined;
    let cached: { until: number; value: PlayPerformance } | undefined;
    const schedule = () => {
        if (timer || writing || stopped || !pending.length) return;
        timer = setTimeout(() => { timer = undefined; void flush(); }, 1000);
        timer.unref();
    };
    async function flush() {
        if (writing || stopped || !pending.length) return;
        const batch = pending; pending = []; writing = true;
        try { await backend.appendPerformance(batch); } catch { /* Diagnostics never fail gameplay. */ }
        finally { writing = false; cached = undefined; schedule(); }
    }
    return {
        record(sample: PlaySample) { if (!stopped) { pending.push(sample); if (pending.length > 256) pending.shift(); schedule(); } },
        flush,
        async snapshot(): Promise<PlayPerformance> {
            if (cached && cached.until > Date.now()) return cached.value;
            let samples: PlaySample[] = [];
            let timeout: ReturnType<typeof setTimeout> | undefined;
            // At most one outstanding read, even if Redis stops answering. Diagnostics time out quickly.
            if (!reading) reading = backend.readPerformance().catch(() => []).finally(() => { reading = undefined; });
            try { samples = (await Promise.race([reading, new Promise<PlaySample[]>(resolve => { timeout = setTimeout(() => resolve([]), 250); })])).filter(sample => sample.at >= Date.now() - PERFORMANCE_TTL).slice(-PERFORMANCE_CAPACITY); } finally { clearTimeout(timeout); }
            const value: PlayPerformance = { capacity: PERFORMANCE_CAPACITY, retentionHours: 24, scope: backend.kind === 'redis' ? 'shared' : 'process', summary: summarizePlays(samples), byKind: summarizeByKind(samples) };
            if (samples.length) cached = { until: Date.now() + 5000, value };
            return value;
        },
        close() { stopped = true; clearTimeout(timer); pending = []; },
    };
}
