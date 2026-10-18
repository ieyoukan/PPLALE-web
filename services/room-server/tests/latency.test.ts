import test from 'node:test';
import assert from 'node:assert/strict';
import { roomLatency, commandTiming } from '../src/latency.ts';
import { memoryBackend } from '../src/backend.ts';
import { serve, shared, startedMatch } from './helpers.ts';

test('latency diagnostics retain a bounded window and report all-time command count without game data', () => {
    const latency = roomLatency(4);
    assert.equal(latency.snapshot().samples, 0);
    for (let i = 1; i <= 10; i++) latency.record({ ...commandTiming(), total: i });
    assert.deepEqual(latency.snapshot(), {
        count: 10, samples: 4,
        milliseconds: Object.fromEntries(Object.keys(commandTiming()).map(stage => [stage, stage === 'total' ? { p50: 8, p95: 10, max: 10 } : { p50: 0, p95: 0, max: 0 }])),
    });
});

test('presence reads both players and spectators together, expiring dead connections', async t => {
    const backend = await shared().open();
    t.after(() => backend.close());
    const id = '123456';
    assert.deepEqual(await backend.presence(id), { online: [false, false], watching: 0 });
    await backend.enter({ id, seat: 0, member: 'host' }, 60_000);
    await backend.enter({ id, seat: 1, member: 'dead' }, 0);
    await backend.enter({ id, seat: 2, member: 'watcher' }, 60_000);
    assert.deepEqual(await backend.presence(id), { online: [true, false], watching: 1 });
    await backend.leave({ id, seat: 2, member: 'watcher' });
    assert.deepEqual(await backend.presence(id), { online: [true, false], watching: 0 });
});

test('a committed command and the next command do not wait for a blocked statistics write', async t => {
    const backend = memoryBackend();
    const gate = Promise.withResolvers<void>(), started = Promise.withResolvers<void>();
    let blocked = false;
    const served = await serve({ data: { open: () => ({ ...backend, async count(name) {
        if (blocked) { started.resolve(); await gate.promise; }
        await backend.count(name);
    } }) } });
    t.after(async () => { gate.resolve(); await served.close(); });
    const { sockets, command } = await startedMatch(served);
    const before = (await served.server.stats()).latency!.count;
    blocked = true;
    const response = command(0, { type: 'openingDraw', actor: 0, deck: 'yojo' });
    await started.promise;
    const acknowledged = await Promise.race([response.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 500))]);
    assert.equal(acknowledged, true, 'response was held by statistics');
    assert.equal(await command(0, { type: 'openingDraw', actor: 0, deck: 'yojo' }), undefined);
    assert.equal(sockets[0].latest().game!.players[0].hand.length, 2);
    const diagnostics = (await served.server.stats()).latency!;
    assert.equal(diagnostics.count, before + 2);
    assert.ok(diagnostics.milliseconds.total.p95 >= 0);
    gate.resolve();
});
