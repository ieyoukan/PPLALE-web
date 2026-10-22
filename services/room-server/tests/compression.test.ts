import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import type { Socket } from 'node:net';
import type { ServerMessage } from '@pplale/game-core/room';
import { serve, startedMatch } from './helpers.ts';

test('compressed and legacy sockets receive the same redacted game with much less wire data', async () => {
    const served = await serve({ beatSeconds: 3600 });
    const clients: WebSocket[] = [];
    try {
        const match = await startedMatch(served);
        async function firstView(compression: boolean) {
            const socket = new WebSocket(`ws://localhost:${served.port}/rooms/${match.id}/socket`, { perMessageDeflate: compression });
            clients.push(socket);
            await once(socket, 'open');
            const transport = (socket as unknown as { _socket: Socket })._socket;
            const before = transport.bytesRead;
            const message = once(socket, 'message');
            socket.send(JSON.stringify({ type: 'hello', token: match.host.token }));
            const [data] = await message;
            const view = JSON.parse(String(data)) as Extract<ServerMessage, { type: 'view' }>;
            return { view: view.view, wireBytes: transport.bytesRead - before, extension: socket.extensions };
        }
        const plain = await firstView(false);
        const compressed = await firstView(true);
        assert.equal(plain.extension, '');
        assert.equal(compressed.extension, 'permessage-deflate');
        assert.deepEqual(compressed.view.game, plain.view.game);
        assert.ok(plain.wireBytes > 4096);
        assert.ok(compressed.wireBytes < plain.wireBytes * .4, `${compressed.wireBytes} / ${plain.wireBytes}`);
        console.log(JSON.stringify({ roomViewWireBytes: { plain: plain.wireBytes, compressed: compressed.wireBytes } }));
    } finally {
        clients.forEach(socket => socket.terminate());
        await served.close();
    }
});

test('duplicate or late publications do not resend an older view to a player', async () => {
    const served = await serve({ beatSeconds: 3600 });
    try {
        const match = await startedMatch(served);
        const room = (await served.backend.get(match.id))!;
        await Promise.all(match.sockets.map(client => client.until(view => view.version >= room.version)));
        const counts = match.sockets.map(client => client.views.length);
        for (const version of [room.version, room.version - 1]) {
            await served.backend.publish({ from: 'late-test-pod', room: { ...room, version }, online: [true, true], watching: 0 });
        }
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.deepEqual(match.sockets.map(client => client.views.length), counts);
        assert.equal(await match.command(0, { type: 'openingDraw', actor: 0, deck: 'yojo' }), undefined);
        assert.ok(match.sockets.every(client => client.latest().version > room.version));
    } finally { await served.close(); }
});
