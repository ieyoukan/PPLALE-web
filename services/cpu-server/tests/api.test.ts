import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { parseValueModel, valueModel } from '@pplale/game-core/ai';
import { createApi } from '../src/http.ts';
import { builtIn, openStore } from '../src/store.ts';
import { catalog, playedReport, temporaryDirectory } from './helpers.ts';

async function serve(options: { origins?: string[]; reportsPerHour?: number } = {}) {
    const store = openStore(temporaryDirectory());
    const api = createApi({ config: { origins: options.origins ?? ['*'], trustProxy: true, reportsPerHour: options.reportsPerHour ?? 100 }, store, catalog });
    await new Promise<void>(resolve => api.listen(0, resolve));
    const url = `http://localhost:${(api.address() as AddressInfo).port}`;
    const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${url}/reports`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { api, store, url, post, close: () => new Promise(resolve => { api.close(resolve); api.closeAllConnections(); }) };
}

test('api: serves the built-in model until one is published', async () => {
    const { api, store, url, close } = await serve();
    const first = await fetch(`${url}/model`);
    assert.equal(first.status, 200);
    const body = await first.json() as { version: string; model: unknown };
    assert.equal(body.version, builtIn.version);
    assert.deepEqual(parseValueModel(body.model), valueModel);
    assert.equal((await fetch(`${url}/model`, { headers: { 'if-none-match': first.headers.get('etag')! } })).status, 304);

    const published = store.publish({ ...valueModel, scale: valueModel.scale + 1 });
    api.reloadModel();
    assert.equal((await (await fetch(`${url}/model`)).json() as { version: string }).version, published.version);
    await close();
});

test('api: stores a played match once and counts it', async () => {
    const { store, url, post, close } = await serve();
    const { report, winner } = playedReport(21);
    assert.equal((await post(report)).status, 201);
    assert.equal((await post(report)).status, 200);
    assert.equal(store.reportCount(), 1);
    // A restart finds the same records on disk.
    assert.equal(openStore(store.directory).readReports()[0].winner, winner);
    const stats = await (await fetch(`${url}/stats`)).json() as { reports: number; results: Record<string, { matches: number; cpuWins: number }> };
    assert.equal(stats.reports, 1);
    assert.deepEqual(stats.results, { 'test-model': { matches: 1, cpuWins: winner === 1 ? 1 : 0 } });
    await close();
});

test('api: rejects what is not a finished match', async () => {
    const { store, post, close } = await serve();
    const { report } = playedReport(22);
    assert.equal((await post({ ...report, commands: report.commands.slice(0, 5) })).status, 400);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post({ ...report, padding: 'x'.repeat(300 * 1024) })).status, 413);
    assert.equal(store.reportCount(), 0);
    await close();
});

test('api: limits reports per client address', async () => {
    const { post, close } = await serve({ reportsPerHour: 2 });
    const from = (address: string) => post({}, { 'x-forwarded-for': address });
    assert.equal((await from('203.0.113.1')).status, 400);
    assert.equal((await from('203.0.113.1')).status, 400);
    assert.equal((await from('203.0.113.1')).status, 429);
    assert.equal((await from('203.0.113.2')).status, 400);
    await close();
});

test('api: answers browsers only from allowed origins', async () => {
    const { url, close } = await serve({ origins: ['https://game.example'] });
    const origin = async (value: string) => (await fetch(`${url}/model`, { headers: { origin: value } })).headers.get('access-control-allow-origin');
    assert.equal(await origin('https://game.example'), 'https://game.example');
    assert.equal(await origin('https://other.example'), null);
    const preflight = await fetch(`${url}/reports`, { method: 'OPTIONS', headers: { origin: 'https://game.example', 'access-control-request-method': 'POST' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /content-type/);
    await close();
});
