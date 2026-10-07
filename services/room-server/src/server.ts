// The room server: rooms are made and entered over HTTP, and each seated player keeps a socket
// open, sends its requests through it and is sent its view of the room whenever anything changes.
//   POST /rooms            { rules, name }  → the new room and the host's seat
//   GET  /rooms/{id}       what a visitor may know
//   POST /rooms/{id}/join  { name }         → the guest's seat
//   WS   /rooms/{id}/socket                 hello (the seat's token), then actions ⇄ views;
//                                           or hello (watch) to look on, where the room allows it
//   GET  /stats            how the server is doing
//   GET  /healthz          the process runs
//   GET  /readyz           …and reaches where the rooms are kept
//
// An instance keeps only its sockets. The rooms are in the backend (Redis), every change is a
// compare-and-set on the room's version, and the instance that made it tells the others, so the
// two players of a room may be connected to different instances.
import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { Catalog, Side } from '@pplale/game-core';
import { ROOM_ID_LENGTH, isRoomId } from '@pplale/game-core/room';
import type { ClientMessage, RoomServerStats, Seated, ServerMessage } from '@pplale/game-core/room';
import type { Backend, Member, Overview, RoomEvent } from './backend.ts';
import type { Config } from './config.ts';
import { RoomError, act, createRoom, joinRoom, roomInfo, seatOf, seatView, tidy } from './rooms.ts';
import type { Present, Room } from './rooms.ts';

/** A request or a socket message is a few kilobytes (a deck at most); anything much larger is not one. */
const MAX_BODY = 16 * 1024;
const HOUR = 60 * 60 * 1000;
/** A socket that has not said who it is by then is closed. */
const HELLO_TIMEOUT = 10_000;
/** Sockets are pinged this often: it keeps proxies from closing them and finds the dead ones. */
const PING_INTERVAL = 25_000;
/** A closed room stays this long, so its last players still learn that it closed. */
const CLOSED_LIFETIME = 10 * 60 * 1000;
/** The counts for /stats and the room limit are read again after this long. */
const OVERVIEW_AGE = 5_000;
/** People who may watch one room at once. */
const MAX_SPECTATORS = 30;
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

type Attached = WebSocket & { alive?: boolean; entry?: Member };

export function createRoomServer({ config, backend, catalog }: {
    config: Pick<Config, 'pod' | 'origins' | 'trustProxy' | 'requestsPerHour' | 'roomsPerHour' | 'lobbyGraceMinutes' | 'abandonMinutes' | 'maxRooms' | 'idleHours' | 'beatSeconds' | 'version'>; backend: Backend; catalog: Catalog;
}): Server & { stats(): Promise<RoomServerStats>; beat(): Promise<void>; shutdown(): Promise<void> } {
    const { pod, origins, trustProxy, requestsPerHour, roomsPerHour, lobbyGraceMinutes, abandonMinutes, maxRooms, idleHours, beatSeconds, version } = config;
    const allowed = limiter(requestsPerHour), mayCreate = limiter(roomsPerHour);
    const patience = { lobby: lobbyGraceMinutes * 60_000, match: abandonMinutes * 60_000 };
    const started = Date.now();
    const beatInterval = beatSeconds * 1000;
    /** A socket or an instance that stops saying it is here counts as gone after three missed beats. */
    const presenceTtl = beatInterval * 3;
    const lifetime = (room: Room) => room.status === 'closed' ? Math.min(CLOSED_LIFETIME, idleHours * HOUR) : idleHours * HOUR;
    /** The sockets this instance holds, by room and spot: the two seats (a player may have the room open twice), then the spectators. */
    const sockets = new Map<string, [Set<Attached>, Set<Attached>, Set<Attached>]>();
    /** Who was online in each of those rooms when its views were last sent. */
    const told = new Map<string, string>();
    let serial = 0;
    const socketsOf = (id: string) => {
        let pair = sockets.get(id);
        if (!pair) sockets.set(id, pair = [new Set(), new Set(), new Set()]);
        return pair;
    };
    const connections = () => Array.from(sockets.values()).reduce((sum, pair) => sum + pair[0].size + pair[1].size + pair[2].size, 0);
    const tell = (socket: WebSocket, message: ServerMessage) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };

    /** Changes the room: `change` edits it (or throws RoomError). Tried again when another request got in first. */
    async function update<T>(id: string, change: (room: Room) => T): Promise<{ room: Room; result: T }> {
        for (let attempt = 0; attempt < 6; attempt++) {
            const room = await backend.get(id);
            if (!room) throw new RoomError(404, GONE);
            const expected = room.version, result = change(room);
            room.version++;
            if (await backend.replace(room, expected, lifetime(room))) return { room, result };
        }
        throw new RoomError(503, '混み合っています。もう一度お試しください');
    }
    const present = async (id: string): Promise<Present> => {
        const [online, watching] = await Promise.all([backend.online(id), backend.watching(id)]);
        return { online, watching };
    };
    const key = ({ online, watching }: Present) => `${online.join()}:${watching}`;
    /** Ends the sockets here of a seat (or of the whole room, with its spectators) that has no room any more. */
    function dismiss(id: string, seat?: Side) {
        const pair = sockets.get(id);
        if (!pair) return;
        for (const index of seat === undefined ? [0, 1, 2] as const : [seat]) {
            for (const socket of Array.from(pair[index])) {
                tell(socket, { type: 'gone', error: GONE });
                socket.close(4404);
            }
        }
    }
    /** Sends each seat's view (and the spectators' view) to the sockets held here. */
    function deliver({ room, online, watching }: Pick<RoomEvent, 'room' | 'online' | 'watching'>) {
        const pair = sockets.get(room.id);
        if (!pair) return;
        told.set(room.id, key({ online, watching }));
        for (const spot of [0, 1, 2] as const) {
            if (spot !== 2 && !room.seats[spot] || !pair[spot].size) continue;
            const message: ServerMessage = { type: 'view', view: seatView(room, spot === 2 ? 'spectator' : spot, { online, watching }) };
            for (const socket of Array.from(pair[spot])) tell(socket, message);
        }
    }
    /** After a change: the sockets here get their views, and the other instances are told to send theirs. */
    async function announce(room: Room, vacated?: Side) {
        const now = await present(room.id);
        deliver({ room, ...now });
        await backend.publish({ from: pod, room, ...now, ...(vacated !== undefined && { dismiss: vacated }) });
    }
    const ready = backend.subscribe(event => {
        if (event.from === pod) return;
        deliver(event);
        if (event.dismiss !== undefined) dismiss(event.room.id, event.dismiss);
    });

    let overview: { at: number; value: Promise<Overview> } | undefined;
    const counts = () => {
        if (!overview || Date.now() - overview.at > OVERVIEW_AGE) overview = { at: Date.now(), value: backend.overview() };
        return overview.value;
    };
    async function stats(): Promise<RoomServerStats> {
        return { version, uptime: Math.round((Date.now() - started) / 1000), backend: backend.kind, ...await counts() };
    }

    const send = (response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
        const text = body === undefined ? '' : JSON.stringify(body);
        response.writeHead(status, { ...(text && { 'content-type': 'application/json; charset=utf-8' }), 'cache-control': 'no-store', ...headers });
        response.end(text);
    };
    const address = (request: IncomingMessage) => {
        const forwarded = trustProxy ? String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
        return forwarded || request.socket.remoteAddress || 'unknown';
    };
    const originAllowed = (origin: string | undefined) => origins.includes('*') || !!origin && origins.includes(origin);
    const seated = async (room: Room, seat: Side, token: string): Promise<Seated> => ({ seat, token, view: seatView(room, seat, await present(room.id)) });

    const server = createServer(async (request, response) => {
        const { origin } = request.headers;
        if (origins.includes('*')) response.setHeader('access-control-allow-origin', '*');
        else if (origin && origins.includes(origin)) {
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
            if (route === 'GET /readyz') return await backend.ping() ? send(response, 200, { ok: true }) : send(response, 503, { ok: false });
            if (route === 'GET /stats') return send(response, 200, await stats());
            if (route !== 'POST /rooms' && !id) return send(response, 404, { error: 'not found' });
            if (!allowed(address(request))) throw new RoomError(429, '操作が多すぎます。しばらく待ってからお試しください');
            if (route === 'POST /rooms') {
                if (!mayCreate(address(request))) throw new RoomError(429, 'ルームを作りすぎています。しばらく待ってからお試しください');
                const { rooms } = await counts();
                if (rooms.lobby + rooms.playing + rooms.finished + rooms.closed >= maxRooms) throw new RoomError(503, 'いまはルームがいっぱいです。しばらく待ってからお試しください');
                const body = await readBody(request);
                for (let attempt = 0; attempt < 8; attempt++) {
                    const made = createRoom(String(randomInt(10 ** ROOM_ID_LENGTH)).padStart(ROOM_ID_LENGTH, '0'), body);
                    if (!await backend.create(made.room, lifetime(made.room))) continue;
                    overview = undefined;
                    await backend.count('roomsCreated');
                    return send(response, 200, await seated(made.room, 0, made.token));
                }
                throw new RoomError(503, 'ルームを作れませんでした。もう一度お試しください');
            }
            if (!isRoomId(id)) throw new RoomError(404, GONE);
            if (request.method === 'GET' && !tail) {
                const room = await backend.get(id);
                if (!room) throw new RoomError(404, GONE);
                return send(response, 200, roomInfo(room));
            }
            if (request.method === 'POST' && tail) {
                const body = await readBody(request);
                const { room, result: token } = await update(id, target => joinRoom(target, body));
                await announce(room);
                return send(response, 200, await seated(room, 1, token));
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
    /** The other side learns that a player came or went (the room gets a new version for it). */
    async function presenceChanged(id: string) {
        try {
            const { room } = await update(id, target => { target.last = null; });
            await announce(room);
        } catch (error) {
            if (!(error instanceof RoomError)) throw error;
        }
    }
    function attach(socket: Attached, id: string) {
        socket.alive = true;
        socket.on('pong', () => { socket.alive = true; });
        const impatient = setTimeout(() => socket.close(4408), HELLO_TIMEOUT);
        // One thing at a time per socket, in the order it happened (also its closing).
        let work = Promise.resolve();
        const next = (task: () => Promise<void>) => { work = work.then(task).catch(error => { console.error('socket failed', error); socket.close(1011); }); };

        async function hello(token: unknown) {
            clearTimeout(impatient);
            const room = await backend.get(id), seat = room ? seatOf(room, token) : null;
            if (!room || seat === null) {
                tell(socket, { type: 'gone', error: room ? 'このルームの参加者ではありません' : GONE });
                return socket.close(4404);
            }
            if (socket.readyState !== socket.OPEN) return;
            socket.entry = { id, seat, member: `${pod}:${++serial}` };
            socketsOf(id)[seat].add(socket);
            // A second tab of the same seat changes nothing for the other side.
            if (await backend.enter(socket.entry, presenceTtl)) await presenceChanged(id);
            else {
                const now = await present(id);
                if (!told.has(id)) told.set(id, key(now));
                tell(socket, { type: 'view', view: seatView(room, seat, now) });
            }
        }
        /** Someone without a seat looks on, where the room allows it. Everyone is told how many do. */
        async function watch() {
            clearTimeout(impatient);
            const room = await backend.get(id);
            const refusal = !room ? GONE : !room.rules.spectators ? 'このルームは観戦できません' : await backend.watching(id) >= MAX_SPECTATORS ? '観戦している人がいっぱいです' : null;
            if (refusal) {
                tell(socket, { type: 'gone', error: refusal });
                return socket.close(4404);
            }
            if (socket.readyState !== socket.OPEN) return;
            socket.entry = { id, seat: 2, member: `${pod}:${++serial}` };
            socketsOf(id)[2].add(socket);
            await backend.enter(socket.entry, presenceTtl);
            await presenceChanged(id);
        }
        async function action(n: number, body: unknown) {
            const { seat } = socket.entry!;
            if (seat === 2) return tell(socket, { type: 'result', n, error: '観戦中は操作できません' });
            try {
                const { room, result: outcome } = await update(id, target => {
                    if (!target.seats[seat]) throw new RoomError(404, GONE);
                    return act(target, seat, body, catalog);
                });
                if (outcome.started) await backend.count('matchesStarted');
                if (outcome.finished) await backend.count('matchesFinished');
                if (outcome.command) await backend.count('commands');
                // The view goes out before the result, so whoever waits for the result already has it.
                await announce(room, outcome.vacated ? seat : undefined);
                tell(socket, { type: 'result', n });
                if (outcome.vacated) dismiss(id, seat);
            } catch (error) {
                if (!(error instanceof RoomError)) console.error('action failed', error);
                tell(socket, { type: 'result', n, error: error instanceof RoomError ? error.message : 'サーバーで問題が起きました' });
            }
        }
        socket.on('message', data => {
            let message: ClientMessage;
            try { message = JSON.parse(String(data)) as ClientMessage; } catch { return socket.close(4400); }
            if (message?.type === 'hello' && !socket.entry) return next(() => message.watch ? watch() : hello(message.token));
            if (message?.type !== 'action' || typeof message.n !== 'number') return socket.close(4400);
            next(async () => { if (socket.entry) await action(message.n, message.action); });
        });
        socket.on('close', () => {
            clearTimeout(impatient);
            next(async () => {
                const { entry } = socket;
                if (!entry) return;
                socket.entry = undefined;
                const pair = socketsOf(id);
                pair[entry.seat].delete(socket);
                if (!pair[0].size && !pair[1].size && !pair[2].size) { sockets.delete(id); told.delete(id); }
                // While shutting down the players are moving to another instance, not leaving.
                // A seat's last socket closing means the player went; every spectator counts.
                if ((await backend.leave(entry) || entry.seat === 2) && !stopping) await presenceChanged(id);
            });
        });
        socket.on('error', () => socket.terminate());
    }

    /**
     * Says that this instance and its sockets are still here, and looks after the rooms it holds
     * sockets of: a room that lapsed is dismissed, and when a player elsewhere vanished without a
     * word (their instance died) the others are told.
     */
    let beating = false, stopping = false;
    async function beat() {
        if (beating || stopping) return;
        beating = true;
        try {
            const entries = Array.from(wss.clients as Set<Attached>).flatMap(socket => socket.entry ? [socket.entry] : []);
            await Promise.all([backend.refresh(entries, presenceTtl), backend.beat(pod, connections(), presenceTtl)]);
            for (const id of Array.from(sockets.keys())) {
                if (!await backend.get(id)) dismiss(id);
                else if (key(await present(id)) !== told.get(id)) await presenceChanged(id);
            }
            await tidyAll();
        } catch (error) {
            console.error('beat failed', error instanceof Error ? error.message : error);
        } finally { beating = false; }
    }
    /**
     * Rooms nobody attends do not linger: a room whose host left before a match closes, a guest who
     * left before it loses the seat, and a match both players left closes. Every instance looks at
     * every room (changes are compare-and-set, so doing it twice does nothing more).
     */
    async function tidyAll(now = Date.now()) {
        for (const id of await backend.ids()) {
            const room = await backend.get(id);
            if (!room) continue;
            const online = await backend.online(id);
            // Most rooms are as they were: they are not written again (it would keep them from expiring).
            if (tidy(structuredClone(room), online, now, patience) === null) continue;
            try {
                const { room: tidied, result } = await update(id, target => tidy(target, online, now, patience));
                if (result === 'closed' || result === 'vacated') await announce(tidied, result === 'vacated' ? 1 : undefined);
                if (result === 'vacated') dismiss(id, 1);
            } catch (error) {
                if (!(error instanceof RoomError)) throw error;
            }
        }
    }
    const beats = setInterval(() => { void beat(); }, beatInterval);
    const pinging = setInterval(() => {
        for (const socket of Array.from(wss.clients) as Attached[]) {
            if (!socket.alive) { socket.terminate(); continue; }
            socket.alive = false;
            socket.ping();
        }
    }, PING_INTERVAL);
    server.on('close', () => { clearInterval(beats); clearInterval(pinging); });
    server.on('listening', () => { void ready.then(beat); });

    return Object.assign(server, {
        stats, beat,
        /**
         * Before stopping: this instance's sockets are no longer counted as present and are closed
         * (1012: the service restarts), and the browsers connect again, to another instance.
         */
        async shutdown() {
            stopping = true;
            clearInterval(beats);
            const held = Array.from(wss.clients as Set<Attached>);
            const entries = held.flatMap(socket => socket.entry ? [socket.entry] : []);
            // Their closing has nothing left to do.
            for (const socket of held) socket.entry = undefined;
            await Promise.allSettled([...entries.map(entry => backend.leave(entry)), backend.forget(pod)]);
            for (const socket of held) socket.close(1012);
            wss.close();
        },
    });
}
