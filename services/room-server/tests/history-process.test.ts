import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Seated } from '@pplale/game-core/room';
import { remoteHistory } from '../src/history/remote.ts';
import { durableBackend } from '../src/history/backend.ts';
import { memoryBackend } from '../src/backend.ts';
import { catalog } from '../src/catalog.ts';
import { fixture, historyAvailable } from './history-helpers.ts';
import { serve, connect, deck } from './helpers.ts';

async function unusedPort() {
    const server = createServer(); await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>(resolve => server.close(() => resolve())); return port;
}

test('durable history process: SIGKILL after acknowledged moves preserves rooms and every frame across replacement', { skip: !historyAvailable }, async t => {
    const { url: database, onClose } = await fixture(t);
    const port = await unusedPort(), url = `http://localhost:${port}`;
    const options = { ...process.env, PORT: String(port), HISTORY_DATABASE_URL: database };
    let child = spawn(process.execPath, [new URL('../src/history-main.ts', import.meta.url).pathname], { env: options, stdio: 'ignore' });
    const resources: { served?: Awaited<ReturnType<typeof serve>> } = {};
    onClose(async () => {
        await resources.served?.close();
        if (child.exitCode === null && child.signalCode === null) { const ended = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGKILL'); await ended; }
    });
    async function wait() {
        for (let attempt = 0; attempt < 100; attempt++) {
            try { if ((await fetch(url + '/readyz')).ok) return; } catch { /* process is starting */ }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('history process did not become ready');
    }
    await wait();
    const history = remoteHistory(url), backend = await durableBackend(memoryBackend(), history, { catalog, version: 'process-test', archiveImages: false });
    const served = await serve({ history, data: { open: () => backend } });
    resources.served = served;
    const headers = { 'x-history-key': 'd'.repeat(64) };
    const a = (await served.call<Seated>('/rooms', { rules: { fruits: ['strawberry'] } }, headers)).data;
    const b = (await served.call<Seated>(`/rooms/${a.view.id}/join`, {}, { 'x-history-key': 'e'.repeat(64) })).data;
    const x = await connect(served, a.view.id, a.token), y = await connect(served, a.view.id, b.token);
    assert.equal(await x.act({ action: 'ready', deck }), undefined);
    assert.equal(await y.act({ action: 'ready', deck }), undefined);
    assert.equal(await x.act({ action: 'command', command: { type: 'roll', actor: 0 }, revision: 0 }), undefined);
    const saved = await history.get(a.view.id);
    assert.ok(saved?.record); assert.equal(saved.state!.revision, 1);
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGKILL'); await exited;
    assert.equal(await backend.ping(), false);
    child = spawn(process.execPath, [new URL('../src/history-main.ts', import.meta.url).pathname], { env: options, stdio: 'ignore' });
    await wait();
    assert.deepEqual(await history.get(a.view.id), saved);
    assert.equal(await y.act({ action: 'resign' }), undefined);
    const { createHash } = await import('node:crypto');
    const owners = [`device:${createHash('sha256').update(headers['x-history-key']).digest('hex')}`];
    const replay = (await history.recording(owners, saved.record.id))!;
    assert.equal(replay.frames.length, 3);
    assert.deepEqual(replay.frames[1].state, saved.state);
    assert.equal(replay.match.reason, 'resign');
});
