import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { clientAddress, limiter, burstLimit, readJson } from '../../shared/http.mts';
import { connect, seatedRoom, serve } from './helpers.ts';

function request(headers = {}) {
    const stream = new PassThrough() as unknown as IncomingMessage;
    stream.headers = headers;
    Object.defineProperty(stream, 'socket', { value: { remoteAddress: '127.0.0.1' } });
    return stream;
}

test('security: spoofed forwarding chains do not change the trusted client address', () => {
    assert.equal(clientAddress(request({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': 'fake, 203.0.113.9' }), true), '203.0.113.9');
    assert.equal(clientAddress(request({ 'x-forwarded-for': '203.0.113.1' }), true), '127.0.0.1');
    assert.equal(clientAddress(request({ 'cf-connecting-ip': '203.0.113.1, 203.0.113.2' }), true), '127.0.0.1');
    assert.equal(clientAddress(request({ 'cf-connecting-ip': '203.0.113.1' }), false), '127.0.0.1');
});

test('security: limiter caps identities and resets; ordinary bursts refill without a wait', () => {
    let now = 0;
    const allowed = limiter(2, 1000, 2, () => now);
    assert.equal(allowed('a'), true); assert.equal(allowed('a'), true); assert.equal(allowed('a'), false);
    assert.equal(allowed('b'), true); assert.equal(allowed('c'), false);
    now = 1000;
    assert.equal(allowed('c'), true);
    const burst = burstLimit(3, 2, () => now);
    assert.deepEqual([burst(), burst(), burst(), burst()], [true, true, true, false]);
    now += 500;
    assert.equal(burst(), true); assert.equal(burst(), false);
});

test('security: oversized and stalled bodies stop before the sender finishes', async () => {
    const large = request();
    const result = readJson(large, 8);
    large.emit('data', Buffer.alloc(9));
    await assert.rejects(result, { status: 413, close: true });
    assert.equal(large.listenerCount('data'), 0);
    const slow = request();
    // Keep the test alive while the production timer is unref'ed.
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(readJson(slow, 8, 10), { status: 408, close: true }); }
    finally { clearTimeout(keepAlive); }
});

test('security: oversized room bodies and malformed JSON leave the server available', async t => {
    const served = await serve(); t.after(() => served.close());
    for (const [body, status] of [['{', 400], ['x'.repeat(17000), 413]] as const) {
        const response = await fetch(served.url + '/rooms', { method: 'POST', body });
        assert.equal(response.status, status);
    }
    assert.equal((await served.call('/rooms', { rules: { fruits: ['strawberry'] } })).status, 200);
});

test('security: changing XFF cannot reset room creation limits', async t => {
    const served = await serve({ roomsPerHour: 1 }); t.after(() => served.close());
    const headers = { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.1' };
    assert.equal((await served.call('/rooms', { rules: { fruits: ['strawberry'] } }, headers)).status, 200);
    assert.equal((await served.call('/rooms', { rules: { fruits: ['strawberry'] } }, { ...headers, 'x-forwarded-for': '203.0.113.2' })).status, 429);
});

test('security: repeated hello cannot attach one socket more than once', async t => {
    const served = await serve(); t.after(() => served.close());
    const { id, host, sockets } = await seatedRoom(served);
    sockets[0].socket.send(JSON.stringify({ type: 'hello', token: host.token }));
    assert.equal(await sockets[0].closed, 4400);
    const rejoined = await connect(served, id, host.token);
    assert.equal((await rejoined.until(() => true)).seat, 0);
});

test('security: one seat permits normal extra tabs but caps them and releases closed slots', async t => {
    const served = await serve(); t.after(() => served.close());
    const { id, host } = await seatedRoom(served);
    const tabs = [];
    for (let i = 0; i < 3; i++) {
        const tab = await connect(served, id, host.token); await tab.until(() => true); tabs.push(tab);
    }
    const excess = await connect(served, id, host.token);
    assert.equal(await excess.closed, 4408);
    await tabs[0].close();
    const replacement = await connect(served, id, host.token);
    assert.equal((await replacement.until(() => true)).seat, 0);
});

test('security: a blocked backend does not allow an unlimited action queue', async t => {
    const served = await serve();
    const { sockets } = await seatedRoom(served);
    const gate = Promise.withResolvers<void>();
    const get = served.backend.get.bind(served.backend);
    served.backend.get = async id => { await gate.promise; return get(id); };
    t.after(async () => { gate.resolve(); await served.close(); });
    for (let i = 0; i < 12; i++) sockets[0].socket.send(JSON.stringify({ type: 'action', n: i, action: { action: 'unready' } }));
    assert.equal(await sockets[0].closed, 4408);
    gate.resolve();
    // The unaffected side remains able to operate after the flooding connection is removed.
    assert.equal(await sockets[1].act({ action: 'unready' }), undefined);
});
