// The room server: rooms are made and entered over HTTP, and each seated player keeps a socket
// open, sends its requests through it and is sent its view of the room whenever anything changes.
//   POST /rooms            { rules, name }  → the new room and the host's seat
//   GET  /rooms/{id}       what a visitor may know
//   POST /rooms/{id}/join  { name }         → the guest's seat
//   WS   /rooms/{id}/socket                 hello (the seat's token), then actions ⇄ views
//   GET  /stats            how the server is doing
//   GET  /healthz
import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { Catalog, Side } from '@pplale/game-core';
import { ROOM_ID_LENGTH, isRoomId } from '@pplale/game-core/room';
import type { ClientMessage, RoomServerStats, Seated, ServerMessage } from '@pplale/game-core/room';
import type { Config } from './config.ts';
import { RoomError, act, createRoom, joinRoom, roomInfo, seatOf, seatView } from './rooms.ts';
import type { Room } from './rooms.ts';
import type { Store } from './store.ts';

/** A request or a socket message is a few kilobytes (a deck at most); anything much larger is not one. */
const MAX_BODY = 16 * 1024;
const HOUR = 60 * 60 * 1000;
/** A socket that has not said who it is by then is closed. */
const HELLO_TIMEOUT = 10_000;
/** Sockets are pinged this often: it keeps proxies from closing them and finds the dead ones. */
const PING_INTERVAL = 25_000;
const SWEEP_INTERVAL = 5 * 60 * 1000;
/** A closed room stays this long, so its last players still learn that it closed. */
const CLOSED_LIFETIME = 10 * 60 * 1000;
const GONE = 'ルームが見つかりません';

/** Counts requests per client address within the current hour. Addresses are never stored. */
function limiter(perHour: number) {
    let started = Date.now(), counts = new Map<string, number>();
    return (address: string) => {
        if (Date.now() - started > HOUR) { started = Date.now(); counts = new Map(); }
        const count = (counts.get(address) ?? 0) + 1;
        counts.set(address, count);
        return count <= perHour;
    };
}

function readBody(request: IncomingMessage): Promise<unknown> {
    return new Promise(resolve => {
        const chunks: Buffer[] = [];
        let size = 0;
        request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size <= MAX_BODY) chunks.push(chunk);
        });
        request.on('end', () => {
            try { resolve(size > MAX_BODY ? null : JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { resolve(null); }
        });
        request.on('error', () => resolve(null));
    });
}

type Attached = WebSocket & { alive?: boolean };

export function createRoomServer({ config, store, catalog }: {
    config: Pick<Config, 'origins' | 'trustProxy' | 'requestsPerHour' | 'maxRooms' | 'idleHours' | 'version'>; store: Store; catalog: Catalog;
}): Server & { stats(): RoomServerStats; sweep(now?: number): void; shutdown(): void } {
    const allowed = limiter(config.requestsPerHour);
    const started = Date.now();
    const since = { roomsCreated: 0, matchesStarted: 0, matchesFinished: 0, commands: 0 };
    /** The open sockets of each seat (a player may have the room open twice). */
    const sockets = new Map<string, [Set<Attached>, Set<Attached>]>();
    const socketsOf = (id: string) => {
        let pair = sockets.get(id);
        if (!pair) sockets.set(id, pair = [new Set(), new Set()]);
        return pair;
    };
    const online = (id: string): [boolean, boolean] => {
        const pair = sockets.get(id);
        return [!!pair?.[0].size, !!pair?.[1].size];
    };
    const tell = (socket: WebSocket, message: ServerMessage) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };
    /** After any change: the room gets its next version, is kept, and every seat is sent its view. */
    function changed(room: Room) {
        room.version++;
        room.touched = Date.now();
        store.save(room);
        const present = online(room.id);
        for (const seat of [0, 1] as const) {
            if (!room.seats[seat]) continue;
            const message: ServerMessage = { type: 'view', view: seatView(room, seat, present) };
            for (const socket of Array.from(socketsOf(room.id)[seat])) tell(socket, message);
        }
    }
    /** Ends the sockets of a seat (or of the whole room) that has no room any more. */
    function dismiss(id: string, seat?: Side) {
        const pair = sockets.get(id);
        if (!pair) return;
        for (const index of seat === undefined ? [0, 1] as const : [seat]) {
            for (const socket of Array.from(pair[index])) {
                tell(socket, { type: 'gone', error: GONE });
                socket.close(4404);
            }
            pair[index].clear();
        }
        if (seat === undefined) sockets.delete(id);
    }

    const send = (response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
        const text = body === undefined ? '' : JSON.stringify(body);
        response.writeHead(status, { ...(text && { 'content-type': 'application/json; charset=utf-8' }), 'cache-control': 'no-store', ...headers });
        response.end(text);
    };
    const address = (request: IncomingMessage) => {
        const forwarded = config.trustProxy ? String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
        return forwarded || request.socket.remoteAddress || 'unknown';
    };
    const originAllowed = (origin: string | undefined) => config.origins.includes('*') || !!origin && config.origins.includes(origin);
    const room = (id: string) => {
        const found = isRoomId(id) ? store.get(id) : undefined;
        if (!found) throw new RoomError(404, GONE);
        return found;
    };
    const seated = (target: Room, seat: Side, token: string): Seated => ({ seat, token, view: seatView(target, seat, online(target.id)) });
    function stats(): RoomServerStats {
        const rooms = { lobby: 0, playing: 0, finished: 0, closed: 0 };
        for (const { status } of store.all()) rooms[status]++;
        let connections = 0;
        for (const pair of Array.from(sockets.values())) connections += pair[0].size + pair[1].size;
        return { version: config.version, uptime: Math.round((Date.now() - started) / 1000), rooms, connections, since: { ...since } };
    }

    const server = createServer(async (request, response) => {
        const { origin } = request.headers;
        if (config.origins.includes('*')) response.setHeader('access-control-allow-origin', '*');
        else if (origin && config.origins.includes(origin)) {
            response.setHeader('access-control-allow-origin', origin);
            response.setHeader('vary', 'origin');
        }
        const path = new URL(request.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
        const route = `${request.method} ${path}`, [, id, tail] = /^\/rooms\/([^/]+)(\/join)?$/.exec(path) ?? [];
        try {
            if (request.method === 'OPTIONS') {
                return send(response, 204, undefined, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
            }
            if (route === 'GET /healthz') return send(response, 200, { ok: true });
            if (route === 'GET /stats') return send(response, 200, stats());
            if (route !== 'POST /rooms' && !id) return send(response, 404, { error: 'not found' });
            if (!allowed(address(request))) throw new RoomError(429, '操作が多すぎます。しばらく待ってからお試しください');
            if (route === 'POST /rooms') {
                if (store.all().length >= config.maxRooms) throw new RoomError(503, 'いまはルームがいっぱいです。しばらく待ってからお試しください');
                const body = await readBody(request);
                for (let attempt = 0; attempt < 8; attempt++) {
                    const fresh = String(randomInt(10 ** ROOM_ID_LENGTH)).padStart(ROOM_ID_LENGTH, '0');
                    if (store.get(fresh)) continue;
                    const made = createRoom(fresh, body);
                    store.save(made.room);
                    since.roomsCreated++;
                    return send(response, 200, seated(made.room, 0, made.token));
                }
                throw new RoomError(503, 'ルームを作れませんでした。もう一度お試しください');
            }
            if (request.method === 'GET' && !tail) return send(response, 200, roomInfo(room(id)));
            if (request.method === 'POST' && tail) {
                const target = room(id), token = joinRoom(target, await readBody(request));
                changed(target);
                return send(response, 200, seated(target, 1, token));
            }
            return send(response, 404, { error: 'not found' });
        } catch (error) {
            if (error instanceof RoomError) return send(response, error.status, { error: error.message });
            console.error('request failed', error);
            return send(response, 500, { error: 'サーバーで問題が起きました。少し待ってからお試しください' });
        }
    });

    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
    server.on('upgrade', (request, socket, head) => {
        const [, id] = /^\/rooms\/(\d+)\/socket\/?$/.exec(new URL(request.url ?? '/', 'http://localhost').pathname) ?? [];
        if (!id || !originAllowed(request.headers.origin)) return socket.destroy();
        wss.handleUpgrade(request, socket, head, connection => attach(connection, id));
    });
    function attach(socket: Attached, id: string) {
        let seat: Side | null = null;
        socket.alive = true;
        socket.on('pong', () => { socket.alive = true; });
        const impatient = setTimeout(() => socket.close(4408), HELLO_TIMEOUT);
        socket.on('message', data => {
            let message: ClientMessage;
            try { message = JSON.parse(String(data)) as ClientMessage; } catch { return socket.close(4400); }
            const target = store.get(id);
            if (message?.type === 'hello' && seat === null) {
                clearTimeout(impatient);
                const found = target ? seatOf(target, message.token) : null;
                if (!target || found === null) {
                    tell(socket, { type: 'gone', error: target ? 'このルームの参加者ではありません' : GONE });
                    return socket.close(4404);
                }
                seat = found;
                const first = !socketsOf(id)[seat].size;
                socketsOf(id)[seat].add(socket);
                // The other side learns that this one is here; a second tab of the same seat changes nothing.
                if (first) {
                    target.last = null;
                    changed(target);
                } else tell(socket, { type: 'view', view: seatView(target, seat, online(id)) });
                return;
            }
            if (message?.type !== 'action' || seat === null || typeof message.n !== 'number') return socket.close(4400);
            if (!target || !target.seats[seat]) return tell(socket, { type: 'gone', error: GONE });
            try {
                const outcome = act(target, seat, message.action, catalog);
                if (outcome.started) since.matchesStarted++;
                if (outcome.finished) since.matchesFinished++;
                if (outcome.command) since.commands++;
                // The view goes out before the result, so whoever waits for the result already has it.
                changed(target);
                tell(socket, { type: 'result', n: message.n });
                if (outcome.vacated) dismiss(id, seat);
            } catch (error) {
                if (!(error instanceof RoomError)) console.error('action failed', error);
                tell(socket, { type: 'result', n: message.n, error: error instanceof RoomError ? error.message : 'サーバーで問題が起きました' });
            }
        });
        socket.on('close', () => {
            clearTimeout(impatient);
            if (seat === null || !sockets.get(id)?.[seat].delete(socket)) return;
            const target = store.get(id);
            if (!target || socketsOf(id)[seat].size) return;
            target.last = null;
            changed(target);
        });
        socket.on('error', () => socket.terminate());
    }

    /** Removes the rooms nobody uses any more. */
    function sweep(now = Date.now()) {
        for (const { id, status, touched } of store.all()) {
            if (now - touched <= (status === 'closed' ? Math.min(CLOSED_LIFETIME, config.idleHours * HOUR) : config.idleHours * HOUR)) continue;
            dismiss(id);
            store.remove(id);
        }
    }
    const sweeping = setInterval(sweep, SWEEP_INTERVAL);
    const pinging = setInterval(() => {
        for (const socket of Array.from(wss.clients) as Attached[]) {
            if (!socket.alive) { socket.terminate(); continue; }
            socket.alive = false;
            socket.ping();
        }
    }, PING_INTERVAL);
    server.on('close', () => { clearInterval(sweeping); clearInterval(pinging); });

    return Object.assign(server, {
        stats, sweep,
        /** Closes every socket (1012: the service restarts); the browsers connect again by themselves. */
        shutdown() {
            for (const socket of Array.from(wss.clients)) socket.close(1012);
            wss.close();
        },
    });
}
