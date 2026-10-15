import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Seated } from '@pplale/game-core/room';
import { connect, deck } from './helpers.ts';

async function unusedPort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    return port;
}

test('Redis: an actual server process can crash and both seats continue on replacement processes', {
    skip: !process.env.REDIS_URL,
    timeout: 30000,
}, async t => {
    async function start() {
        const port = await unusedPort();
        const child = spawn(process.execPath, [new URL('../src/main.ts', import.meta.url).pathname], {
            env: { ...process.env, PORT: String(port), BEAT_SECONDS: '0.1', ALLOWED_ORIGINS: '*' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(async () => {
            if (child.exitCode !== null || child.signalCode !== null) return;
            const stopped = once(child, 'exit');
            child.kill('SIGTERM');
            await stopped;
        });
        let output = '';
        child.stderr.on('data', chunk => { output += String(chunk); });
        await new Promise<void>((resolve, reject) => {
            const earlyExit = () => reject(new Error(`room-server exited before ready: ${output}`));
            child.once('exit', earlyExit);
            child.once('error', reject);
            child.stdout.on('data', chunk => {
                output += String(chunk);
                if (!output.includes(`on :${port}, rooms in redis`)) return;
                child.off('exit', earlyExit);
                resolve();
            });
        });
        return { port, child, url: `http://localhost:${port}` };
    }
    async function post(server: { url: string }, path: string, body: unknown) {
        const response = await fetch(server.url + path, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        assert.equal(response.status, 200);
        return await response.json() as Seated;
    }
    const first = await start(), second = await start();
    const host = await post(first, '/rooms', {
        name: 'process-host', rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: false },
    });
    const id = host.view.id;
    const guest = await post(second, `/rooms/${id}/join`, { name: 'process-guest' });
    const a = await connect(first, id, host.token), b = await connect(second, id, guest.token);
    t.after(() => { a.socket.terminate(); b.socket.terminate(); });
    await Promise.all([a, b].map(client => client.until(view => view.players[0].online && !!view.players[1]?.online)));
    assert.equal(await a.act({ action: 'ready', deck }), undefined);
    assert.equal(await b.act({ action: 'ready', deck }), undefined);
    const before = (await a.until(view => view.status === 'playing')).game!;

    const crashed = once(first.child, 'exit');
    first.child.kill('SIGKILL');
    await Promise.all([crashed, a.closed]);
    const recovered = await connect(second, id, host.token);
    t.after(() => recovered.socket.terminate());
    const restored = (await recovered.until(view => view.status === 'playing')).game!;
    assert.deepEqual(restored, before);
    assert.equal(await recovered.act({
        action: 'command', revision: restored.revision, command: { type: 'roll', actor: 0 },
    }), undefined);
    const rolled = (await recovered.until(view => view.game!.dice!.rolls[0] !== null)).game!;

    // Replace the remaining process as well; the next one recovers both seats and the changed game.
    const stopped = once(second.child, 'exit');
    second.child.kill('SIGKILL');
    await Promise.all([stopped, b.closed, recovered.closed]);
    const replacement = await start();
    const last = await connect(replacement, id, host.token);
    t.after(() => last.socket.terminate());
    const final = (await last.until(view => view.status === 'playing')).game!;
    assert.deepEqual(final, rolled);
    const lastGuest = await connect(replacement, id, guest.token);
    t.after(() => lastGuest.socket.terminate());
    const guestView = await lastGuest.until(view => view.status === 'playing');
    assert.equal(guestView.seat, 1);
    assert.equal(guestView.game!.revision, rolled.revision);
    assert.deepEqual(guestView.game!.dice, rolled.dice);
});
