// 新しい対戦記録が十分に集まったら、別プロセスで学習する。APIを止めず、受信時と定期実行時に次の学習を判断する。
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
