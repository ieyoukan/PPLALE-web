// The HTTP API the game talks to:
//   GET  /model    the value model さいきょう should play with
//   POST /reports  a finished match against さいきょう (anonymous; stored after it replays)
//   GET  /stats    how many matches were collected and what training did with them
//   GET  /healthz
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Catalog } from '@pplale/game-core';
import type { Config } from './config.ts';
import { verifyReport } from './report.ts';
import type { PublishedModel, Store } from './store.ts';

/** A report is a few kilobytes; anything much larger is not one. */
const MAX_BODY = 256 * 1024;
const HOUR = 60 * 60 * 1000;

/** Counts requests per client address within the current hour. Addresses are never stored. */
function limiter(perHour: number) {
    let started = Date.now(), counts = new Map<string, number>();
    return (address: string) => {
        if (Date.now() - started > HOUR) { started = Date.now(); counts = new Map(); }
        const count = (counts.get(address) ?? 0) + 1;
        counts.set(address, count);
        return count <= perHour;
    };
}

function readBody(request: IncomingMessage): Promise<string | null> {
    return new Promise(resolve => {
        const chunks: Buffer[] = [];
        let size = 0;
        request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            // The rest is read and dropped; the caller closes the connection after answering.
            if (size > MAX_BODY) resolve(null); else chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', () => resolve(null));
    });
}

export function createApi({ config, store, catalog, training, onReport }: {
    config: Pick<Config, 'origins' | 'trustProxy' | 'reportsPerHour'>; store: Store; catalog: Catalog;
    /** Whether a training run is in progress, for /stats. */
    training?: () => boolean;
    /** Called after a new match was stored. */
    onReport?: () => void;
}): Server & { reloadModel(): void } {
    const allowed = limiter(config.reportsPerHour);
    // Read once and after each training run, not per request.
    let model: PublishedModel = store.currentModel(), modelBody = JSON.stringify(model);

    const send = (response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
        const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
        response.writeHead(status, { ...(text && { 'content-type': 'application/json; charset=utf-8' }), ...headers });
        response.end(text);
    };
    const address = (request: IncomingMessage) => {
        const forwarded = config.trustProxy ? String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
        return forwarded || request.socket.remoteAddress || 'unknown';
    };

    const server = createServer(async (request, response) => {
        const origin = request.headers.origin;
        if (config.origins.includes('*')) response.setHeader('access-control-allow-origin', '*');
        else if (origin && config.origins.includes(origin)) {
            response.setHeader('access-control-allow-origin', origin);
            response.setHeader('vary', 'origin');
        }
        const route = `${request.method} ${new URL(request.url ?? '/', 'http://localhost').pathname}`;
        if (request.method === 'OPTIONS') {
            return send(response, 204, undefined, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
        }
        if (route === 'GET /healthz') return send(response, 200, { ok: true });
        if (route === 'GET /model') {
            const headers = { etag: `"${model.version}"`, 'cache-control': 'public, max-age=300' };
            return request.headers['if-none-match'] === headers.etag ? send(response, 304, undefined, headers) : send(response, 200, modelBody, headers);
        }
        if (route === 'GET /stats') {
            const log = store.training();
            return send(response, 200, { model: model.version, reports: store.reportCount(), results: store.results(), training: { running: training?.() ?? false, runs: log.runs.slice(-10) } }, { 'cache-control': 'no-store' });
        }
        if (route === 'POST /reports') {
            if (!allowed(address(request))) return send(response, 429, { error: 'too many reports' });
            const text = await readBody(request);
            if (text === null) {
                response.on('finish', () => request.destroy());
                return send(response, 413, { error: 'too large' }, { connection: 'close' });
            }
            let body: unknown;
            try { body = JSON.parse(text); } catch { return send(response, 400, { error: 'not JSON' }); }
            const record = verifyReport(body, catalog);
            if ('error' in record) return send(response, 400, record);
            const added = store.addReport(record);
            if (added) onReport?.();
            return send(response, added ? 201 : 200, { id: record.id });
        }
        return send(response, 404, { error: 'not found' });
    });
    return Object.assign(server, {
        reloadModel() { model = store.currentModel(); modelBody = JSON.stringify(model); },
    });
}
