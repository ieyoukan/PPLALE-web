// 受信した対戦記録をHTTPスレッド外で検証する。要求ごとに作らず、同じWorkerを使い続ける。
import { parentPort, workerData } from 'node:worker_threads';
import type { Catalog } from '@pplale/game-core';
import { verifyReport } from './report.ts';

parentPort!.on('message', (body: unknown) => {
    try { parentPort!.postMessage(verifyReport(body, workerData as Catalog)); }
    catch { parentPort!.postMessage({ error: 'invalid match' }); }
});
