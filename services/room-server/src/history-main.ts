// Private ClusterIP RPC service. Backups run in a separate Kubernetes CronJob, never here.
import { createServer } from 'node:http';
import { PostgresHistory } from './history/postgres.ts';

if (!process.env.HISTORY_DATABASE_URL) throw new Error('HISTORY_DATABASE_URL is required');
const history = await PostgresHistory.open(process.env.HISTORY_DATABASE_URL, process.env.HISTORY_SYNCHRONOUS_COMMIT === 'remote_apply' ? 'remote_apply' : 'on');
const methods = new Set(['assetIds', 'putAsset', 'asset', 'registerCatalog', 'ingest', 'get', 'linkGuest', 'list', 'detail', 'recording', 'favorite', 'ping']);
const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    try {
        if (request.method === 'GET' && request.url === '/healthz') { response.writeHead(200); return response.end('{"ok":true}'); }
        if (request.method === 'GET' && request.url === '/readyz') {
            const ok = await history.ping(); response.writeHead(ok ? 200 : 503); return response.end(JSON.stringify({ ok }));
        }
        if (request.method !== 'POST' || request.url !== '/rpc') { response.writeHead(404); return response.end('{}'); }
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) {
            size += chunk.length;
            if (size > 16 * 1024 * 1024) { response.writeHead(413); return response.end('{}'); }
            chunks.push(chunk);
        }
        const { method, args } = JSON.parse(Buffer.concat(chunks).toString()) as { method: string; args: unknown[] };
        if (!methods.has(method) || !Array.isArray(args) || args.length > 5) { response.writeHead(400); return response.end('{}'); }
        const fn = history[method as keyof typeof history] as (...args: unknown[]) => Promise<unknown>;
        const result = await fn.apply(history, args);
        response.end(JSON.stringify(result ?? null));
    } catch (error) {
        console.error('history transaction failed', error instanceof Error ? error.message : 'unknown');
        response.writeHead(503); response.end('{"error":"history unavailable"}');
    }
});
server.listen(Number(process.env.PORT ?? 8081), () => console.log('PostgreSQL history service ready'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    server.close(() => { void history.close().then(() => process.exit(0)); });
    server.closeIdleConnections();
});
