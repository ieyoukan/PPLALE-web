import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { Deck } from '@pplale/game-core';
import type { ClientMessage, RoomAction, RoomView, Seated, ServerMessage } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import type { Config } from '../src/config.ts';
import { memoryBackend, redisBackend } from '../src/backend.ts';
import type { Backend } from '../src/backend.ts';
import { createRoomServer } from '../src/server.ts';

/**
 * What the instances of one test share. With REDIS_URL the tests run against that Redis (each under
 * its own key prefix), otherwise against the in-process stand-in.
 */
export const usingRedis = !!process.env.REDIS_URL;
export function shared() {
    const prefix = `pplale-test-${randomBytes(6).toString('hex')}:`, memory = memoryBackend();
    return { open: (): Promise<Backend> | Backend => usingRedis ? redisBackend(process.env.REDIS_URL!, prefix) : memory };
}
export type Shared = ReturnType<typeof shared>;
let pods = 0;
export const deck = JSON.parse(readFileSync(new URL('../../../src/data/strawberryStableDeck.json', import.meta.url), 'utf8')) as Deck;

/** One instance of the server. Instances given the same `data` are instances of the same deployment. */
export async function serve({ data = shared(), ...options }: Partial<Config> & { data?: Shared } = {}) {
    const backend = await data.open();
    const server = createRoomServer({ config: { pod: `pod-${++pods}`, origins: ['*'], trustProxy: true, requestsPerHour: 1000, roomsPerHour: 1000, lobbyGraceMinutes: 10, abandonMinutes: 30, maxRooms: 100, idleHours: 12, beatSeconds: 0.1, version: 'test', ...options }, backend, catalog });
    await new Promise<void>(resolve => server.listen(0, resolve));
    await server.beat();
    const { port } = server.address() as AddressInfo, url = `http://localhost:${port}`;
    const call = async <T>(route: string, body?: unknown, headers: Record<string, string> = {}) => {
        const response = await fetch(url + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(body !== undefined && { body: JSON.stringify(body) }) });
        return { status: response.status, data: await response.json() as T & { error?: string } };
    };
    const close = async () => {
        await server.shutdown();
        await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
        await backend.close();
    };
    return { server, backend, data, url, port, call, close };
}
export type Served = Awaited<ReturnType<typeof serve>>;

/** A seat's socket (or, without a token, a spectator's): collects what it is sent, and sends actions waiting for their result. */
export async function connect(served: Pick<Served, 'port'>, id: string, token: string | null, headers: Record<string, string> = {}) {
    const socket = new WebSocket(`ws://localhost:${served.port}/rooms/${id}/socket`, { headers });
    const views: RoomView[] = [], results = new Map<number, (error: string | undefined) => void>(), waiting: (() => void)[] = [];
    let gone: string | null = null, n = 0;
    const closed = new Promise<number>(resolve => socket.on('close', code => { resolve(code); waiting.splice(0).forEach(wake => wake()); }));
    socket.on('error', () => {});
    socket.on('message', data => {
        const message = JSON.parse(String(data)) as ServerMessage;
        if (message.type === 'view') views.push(message.view);
        else if (message.type === 'result') results.get(message.n)?.(message.error);
        else gone = message.error;
        waiting.splice(0).forEach(wake => wake());
    });
    const say = (message: ClientMessage) => socket.send(JSON.stringify(message));
    await new Promise<void>((resolve, reject) => { socket.once('open', () => resolve()); socket.once('error', reject); socket.once('unexpected-response', () => reject(new Error('refused'))); });
    say(token === null ? { type: 'hello', watch: true } : { type: 'hello', token });
    const next = () => new Promise<void>(resolve => waiting.push(resolve));
    return {
        socket, views, closed,
        gone: () => gone,
        latest: () => views.at(-1)!,
        /** Waits until the latest view satisfies `test`. */
        async until(test: (view: RoomView) => boolean) {
            while (!views.length || !test(views.at(-1)!)) {
                if (socket.readyState > 1) throw new Error(`socket closed while waiting (${gone})`);
                await next();
            }
            return views.at(-1)!;
        },
        /** Sends an action; resolves with the error it was refused with, or undefined. */
        act(action: RoomAction) {
            const number = ++n;
            return new Promise<string | undefined>(resolve => { results.set(number, resolve); say({ type: 'action', n: number, action }); });
        },
        close: () => { socket.close(); return closed; },
    };
}
export type Client = Awaited<ReturnType<typeof connect>>;

/** A room with both seats taken and connected: the host to `served`, the guest to `other` (another instance) when given. */
export async function seatedRoom(served: Served, other: Served = served, spectators = false) {
    const host = (await served.call<Seated>('/rooms', { rules: { fruits: ['strawberry'], extendedPlayable: false, spectators }, name: 'ほすと' })).data;
    const { id } = host.view;
    const guest = (await served.call<Seated>(`/rooms/${id}/join`, { name: 'げすと' })).data;
    const sockets: [Client, Client] = [await connect(served, id, host.token), await connect(other, id, guest.token)];
    await Promise.all(sockets.map(socket => socket.until(view => !!view.players[1]?.online && view.players[0].online)));
    return { id, host, guest, sockets };
}

/** Both ready, dice thrown until someone may choose: returns who goes first after choosing 先攻. */
export async function startedMatch(served: Served, other: Served = served, spectators = false) {
    const room = await seatedRoom(served, other, spectators), { sockets } = room;
    for (const socket of sockets) await socket.act({ action: 'ready', deck });
    await Promise.all(sockets.map(socket => socket.until(view => view.status === 'playing')));
    const command = (seat: 0 | 1, sent: Extract<RoomAction, { action: 'command' }>['command']) => sockets[seat].act({ action: 'command', command: sent, revision: sockets[seat].latest().game!.revision });
    while (sockets[0].latest().game!.phase === 'dice') {
        await command(0, { type: 'roll', actor: 0 });
        await command(1, { type: 'roll', actor: 1 });
    }
    const first = sockets[0].latest().game!.active;
    await command(first, { type: 'initiative', actor: first, order: 'first' });
    return { ...room, first, command };
}
