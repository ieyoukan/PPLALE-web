// The HTTP API the game talks to:
//   GET  /model    the value model さいきょう should play with
//   POST /reports  a finished match against さいきょう (anonymous; stored after it replays)
//   GET  /stats    how many matches were collected and what training did with them
//   GET  /healthz
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Catalog } from '@pplale/game-core';
import type { Config } from './config.ts';
import { clientAddress, HttpError, limiter, readJson } from '../../shared/http.mts';
import { ReportVerifier } from './report-verifier.ts';
import type { PublishedModel, Store } from './store.ts';

/** A report is a few kilobytes; anything much larger is not one. */
const MAX_BODY = 256 * 1024;
export function createApi({ config, store, catalog, training, onReport }: {
    config: Pick<Config, 'origins' | 'trustProxy' | 'reportsPerHour'>; store: Store; catalog: Catalog;
    /** Whether a training run is in progress, for /stats. */
    training?: () => boolean;
    /** Called after a new match was stored. */
    onReport?: () => void;
}): Server & { reloadModel(): void } {
    const allowed = limiter(config.reportsPerHour);
    const verifier = new ReportVerifier(catalog);
    const statsAllowed = limiter(60, 60_000);
    let pendingReports = 0;
    // Read once and after each training run, not per request.
    let model: PublishedModel = store.currentModel(), modelBody = JSON.stringify(model);

    const send = (response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
        const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
        response.writeHead(status, { ...(text && { 'content-type': 'application/json; charset=utf-8' }), ...headers });
        response.end(text);
    };
    const address = (request: IncomingMessage) => clientAddress(request, config.trustProxy);

    const server = createServer(async (request, response) => {
        try {
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
                if (!statsAllowed(address(request))) return send(response, 429, { error: 'too many requests' });
                const log = store.training();
                return send(response, 200, { model: model.version, reports: store.reportCount(), results: store.results(), training: { running: training?.() ?? false, runs: log.runs.slice(-10) } }, { 'cache-control': 'no-store' });
            }
            if (route === 'POST /reports') {
                if (!allowed(address(request))) return send(response, 429, { error: 'too many reports' });
                if (pendingReports >= 8) throw new HttpError(503, 'report verification busy', true);
                pendingReports++;
                try {
                    const body = await readJson(request, MAX_BODY);
                    const record = await verifier.verify(body);
                    if ('error' in record) return send(response, 400, record);
                    const added = store.addReport(record);
                    if (added) onReport?.();
                    return send(response, added ? 201 : 200, { id: record.id });
                } finally { pendingReports--; }
            }
            return send(response, 404, { error: 'not found' });
        } catch (error) {
            if (error instanceof HttpError) {
                if (error.close) response.once('finish', () => request.destroy());
                return send(response, error.status, { error: error.message }, error.close ? { connection: 'close' } : {});
            }
            console.error('request failed', error instanceof Error ? error.message : 'unknown');
            return send(response, 500, { error: 'request failed' });
        }
    });
    server.maxConnections = 128;
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    server.on('close', () => { void verifier.close(); });
    return Object.assign(server, {
        reloadModel() { model = store.currentModel(); modelBody = JSON.stringify(model); },
    });
}
