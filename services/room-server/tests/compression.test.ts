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
