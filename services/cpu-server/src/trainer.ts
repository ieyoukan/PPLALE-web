// Keeps learning: whenever enough new matches arrived, runs train-job.ts as its own process, so
// the API stays responsive while it works. Checked when a match arrives and on a timer (a run
// that was busy when the last match came in is followed by the next one).
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.ts';
import type { Store } from './store.ts';

export function startTrainer({ config, store, onFinished }: { config: Config; store: Store; onFinished: () => void }) {
    let job: ChildProcess | null = null;
    const check = () => {
        if (job || store.reportCount() - store.training().trainedReports < config.training.minNewReports) return;
        console.log('training: started');
        job = spawn(process.execPath, [fileURLToPath(new URL('./train-job.ts', import.meta.url))], { stdio: 'inherit' });
        job.on('exit', code => {
            job = null;
            console.log(`training: finished${code ? ` with code ${code}` : ''}`);
            onFinished();
        });
    };
    const timer = config.training.enabled ? setInterval(check, config.training.intervalMinutes * 60 * 1000) : null;
    if (timer) check();
    return {
        /** Starts a run if enough new matches are waiting and none is in progress. */
        check: () => { if (config.training.enabled) check(); },
        running: () => job !== null,
        stop() {
            if (timer) clearInterval(timer);
            job?.kill();
        },
    };
}
