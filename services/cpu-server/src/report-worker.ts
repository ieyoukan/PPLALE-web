// Keep replaying untrusted reports off the HTTP thread. One persistent worker, not one per request.
import { parentPort, workerData } from 'node:worker_threads';
import type { Catalog } from '@pplale/game-core';
import { verifyReport } from './report.ts';

parentPort!.on('message', (body: unknown) => {
    try { parentPort!.postMessage(verifyReport(body, workerData as Catalog)); }
    catch { parentPort!.postMessage({ error: 'invalid match' }); }
});
