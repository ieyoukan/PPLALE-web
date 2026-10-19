import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportVerifier } from '../src/report-verifier.ts';
import { openStore } from '../src/store.ts';
import { catalog, temporaryDirectory } from './helpers.ts';

const stuck = new URL('data:text/javascript,import { parentPort } from "node:worker_threads"; parentPort.on("message", () => { while (true) {} });');

test('security: a hung replay has a bounded queue and cannot block the main thread', async t => {
    const options: { workerUrl?: URL; timeoutMs: number; maxWaiting: number } = { workerUrl: stuck, timeoutMs: 100, maxWaiting: 1 };
    const verifier = new ReportVerifier(catalog, options);
    t.after(() => verifier.close());
    const active = assert.rejects(verifier.verify({}), { status: 503 });
    const waiting = assert.rejects(verifier.verify({}), { status: 503 });
    await assert.rejects(verifier.verify({}), /busy/);
    await new Promise<void>(resolve => setImmediate(resolve));
    await Promise.all([active, waiting]);
    delete options.workerUrl; options.timeoutMs = 5000;
    assert.deepEqual(await verifier.verify(null), { error: 'not a report' });
});

test('security: a verifier reuses its worker and rejects work after shutdown', async () => {
    const verifier = new ReportVerifier(catalog);
    assert.deepEqual(await verifier.verify(null), { error: 'not a report' });
    assert.deepEqual(await verifier.verify({}), { error: 'only さいきょう matches are collected' });
    await verifier.close();
    await assert.rejects(verifier.verify({}), { status: 503 });
});

test('security: model names cannot mutate the statistics object prototype', () => {
    const store = openStore(temporaryDirectory());
    for (const [id, model] of ['__proto__', 'constructor', 'toString'].entries()) {
        // The verifier accepts model labels as text; test the storage boundary directly.
        store.addReport({ id: String(id), day: '2026-10-19', model, winner: 1 } as Parameters<typeof store.addReport>[0]);
    }
    const results = JSON.parse(JSON.stringify(store.results()));
    assert.deepEqual(results['__proto__'], { matches: 1, cpuWins: 1 });
    assert.deepEqual(results.constructor, { matches: 1, cpuWins: 1 });
    assert.equal(Object.hasOwn(Object.prototype, 'matches'), false);
});
