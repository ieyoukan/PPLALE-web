import { burstLimit, clientAddress, HttpError, limiter, readJson } from '../../shared/http.mts';
import { freeMatchActivity } from './public-matches.ts';
import { profileNames } from './profile-names.ts';
// The room server: rooms are made and entered over HTTP, and each seated player keeps a socket
// open, sends its requests through it and is sent its view of the room whenever anything changes.
//   POST /rooms            { rules, name }  → the new room and the host's seat
//                          { rules, name, plaza } → a new plaza (plaza.ts) and its creator's member secret
//   GET  /rooms/{id}       what a visitor may know (a plaza: only one they may enter; `?invite=`)
//   POST /rooms/{id}/join  { name }         → the guest's seat; a plaza: { name, invite } → a member secret
//   POST /rooms/lookup     { ids }          what the asker may know of several rooms at once (friends' rooms)
//   POST /rooms/ask        { to }           a signed-in player asks a friend's invited room to let them in
//   POST /rooms/invited                     plazas that let the signed-in player in by name
//   WS   /rooms/{id}/socket                 hello (the seat's or member's token), then actions ⇄ views;
//                                           or hello (watch) to look on, where the room allows it
//   GET  /push/key                          the key browsers subscribe with (null: no notifications)
//   POST /push/subscribe   { subscription }  a signed-in player's browser wants notifications (push.ts)
//   POST /push/unsubscribe { endpoint }      …or no longer
//   POST /push/friend      { to, kind }      tell a friend of a request / its acceptance (checked in Firestore)
//   POST /push/recruit     { roomId }        tell the friends that the player recruits for that room
//   GET  /stats            how the server is doing
//   GET  /healthz          the process runs
//   GET  /readyz           …and reaches where the rooms are kept
//
// An instance keeps only its sockets. The rooms are in the backend (Redis), every change is a
// compare-and-set on the room's version, and the instance that made it tells the others, so the
// two players of a room may be connected to different instances.
import { randomInt } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { Catalog, Side } from '@pplale/game-core';
import { ROOM_ID_LENGTH, isRoomId } from '@pplale/game-core/room';
import type { ClientMessage, Entered, PlazaRequest, RoomAction, RoomServerStats, Seated, ServerMessage } from '@pplale/game-core/room';
import { memberOfEntry } from './backend.ts';
import type { Backend, Member, Overview, RoomEvent, Spot } from './backend.ts';
import type { Config } from './config.ts';
import { RoomError, act, createRoom, expireTurn, joinRoom, playerName, roomInfo, seatOf, seatView, tidy } from './rooms.ts';
import type { Present, Room } from './rooms.ts';
import { actPlaza, admit, askToEnter, cpuToAct, createPlaza, entryOf, formerOf, memberOf, notePresence, playCpu, plazaInfo, plazaView, succeed, tidyPlaza } from './plaza.ts';
import type { PlazaOutcome, Visitor } from './plaza.ts';
import { cpuThinker } from './cpu.ts';
import { handReactionOps } from '@pplale/game-core';

import { historyOwners, seatOwners } from './history/identity.ts';
import type { HistoryRepository } from './history/repository.ts';
import { freeMatch } from './matchmaking.ts';
import { commandTiming, roomLatency } from './latency.ts';
import { playPerformance } from './play-performance.ts';
import { isPlayKind, parsePlayReport, parseServerTiming } from '@pplale/game-core/performance';
import type { PlayKind, ServerTiming } from '@pplale/game-core/performance';
import type { CommandTiming } from './latency.ts';
import { memoryPushStore, pusher, subscription } from './push.ts';
import type { Notice, Pusher } from './push.ts';
import { decider, notices } from './push-notices.ts';
import { friendsOf, friendshipBetween, recruitmentOf } from './push-friends.ts';

/** Rooms looked up at once by the friends screen. */
const MAX_LOOKUP = 24;
/** How long the CPU takes for a move, so that people can follow it (ms). */
const CPU_PACE = 750, CPU_OPENING_PACE = 450;
/** A CPU answering a hand reaction takes as long as a person might, so the wait does not tell what it holds. */
const cpuReactionPace = () => 800 + randomInt(1400);
/** Where a socket's entry is kept among a room's sockets here. */
const spotIndex = (spot: Spot) => spot === 'm' ? 3 : spot;

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
/** A plaza that cannot be told apart from one that does not exist: it may only be known to those who may enter. */
const HIDDEN = 'ルームが見つからないか、招待が必要です';
const CLOSED = 'このルームは閉じました';
const LEFT = 'ルームから出ました';

type Attached = WebSocket & { alive?: boolean; entry?: Member };
/** The members connected now, as the views and tidying take them. */
const onlineMembers = (present: Pick<Present, 'members'>) => new Set(present.members ?? []);

export function createRoomServer({ config, backend, catalog, history, push = pusher(memoryPushStore(), null) }: {
    config: Pick<Config, 'pod' | 'origins' | 'trustProxy' | 'requestsPerHour' | 'roomsPerHour' | 'lobbyGraceMinutes' | 'abandonMinutes' | 'maxRooms' | 'idleHours' | 'beatSeconds' | 'version'>; backend: Backend; catalog: Catalog; history?: HistoryRepository;
    /** Push notifications (none are sent without VAPID keys). */
    push?: Pusher;
}): Server & { stats(): Promise<RoomServerStats>; beat(): Promise<void>; shutdown(): Promise<void> } {
    const { pod, origins, trustProxy, requestsPerHour, roomsPerHour, lobbyGraceMinutes, abandonMinutes, maxRooms, idleHours, beatSeconds, version } = config;
    const names = profileNames();
    const allowed = limiter(requestsPerHour), mayCreate = limiter(roomsPerHour);
    const patience = { lobby: lobbyGraceMinutes * 60_000, match: abandonMinutes * 60_000 };
    let activityCache: { until: number; value: Awaited<ReturnType<typeof freeMatchActivity>> } | undefined;
    let activityLoading: Promise<Awaited<ReturnType<typeof freeMatchActivity>>> | undefined;
    const activityAllowed = limiter(requestsPerHour * 4);
    const started = Date.now();
    const latency = roomLatency();
    const performanceMetrics = playPerformance(backend);
    const counting = new Set<Promise<void>>();
    // Statistics are best effort: failure must never reject an already committed game command.
    const countLater = (name: Parameters<Backend['count']>[0]) => {
        const task = backend.count(name).catch(error => console.error('room statistics', error instanceof Error ? error.message : 'unavailable'));
        counting.add(task);
        void task.finally(() => counting.delete(task));
    };
    const beatInterval = beatSeconds * 1000;
    /** A socket or an instance that stops saying it is here counts as gone after three missed beats. */
    const presenceTtl = beatInterval * 3;
    const lifetime = (room: Room) => room.status === 'closed' ? Math.min(CLOSED_LIFETIME, idleHours * HOUR) : idleHours * HOUR;
    /** The sockets this instance holds, by room and spot: the two seats (a player may have the room open twice), the spectators, then a plaza's members. */
    const sockets = new Map<string, [Set<Attached>, Set<Attached>, Set<Attached>, Set<Attached>]>();
    const thinker = cpuThinker(catalog);
    // One pending CPU move per plaza whose sockets are here; any instance may make it, the first to claim it does.
    const cpuTimers = new Map<string, { version: number; timer: ReturnType<typeof setTimeout> }>();
    function scheduleCpu(room: Room) {
        const previous = cpuTimers.get(room.id);
        if (previous && previous.version >= room.version) return;
        if (previous) clearTimeout(previous.timer);
        cpuTimers.delete(room.id);
        const seat = cpuToAct(room);
        if (stopping || seat === null || !sockets.has(room.id) || !room.state) return;
        const state = room.state, pace = state.phase === 'opening' || state.phase === 'mulligan' ? CPU_OPENING_PACE : handReactionOps.includes(state.pending?.task.op ?? '') ? cpuReactionPace() : CPU_PACE;
        const timer = setTimeout(() => { cpuTimers.delete(room.id); void playCpuMove(room.id, room.version, seat); }, pace);
        timer.unref();
        cpuTimers.set(room.id, { version: room.version, timer });
    }
    async function playCpuMove(id: string, version: number, seat: Side) {
        try {
            if (!await backend.claim(`cpu:${id}:${version}`, 60_000)) return;
            const room = await backend.get(id);
            if (!room || room.version !== version || cpuToAct(room) !== seat) return;
            const level = room.seats[seat]!.cpu!, expected = { match: room.match, revision: room.state!.revision };
            const state = room.state!;
            // Should no move be found, the turn (or the choice) is still finished rather than left waiting.
            const sent = await thinker.think(state, level, seat)
                ?? (state.pending ? { type: 'choose' as const, actor: seat, option: state.pending.options[0]?.id ?? '' } : state.phase === 'playing' ? { type: 'end' as const, actor: seat } : null);
            if (!sent || stopping) return;
            let before: Side | null = null;
            const { room: played, result: outcome } = await update(id, target => {
                before = decider(target);
                return playCpu(target, seat, sent as Parameters<typeof playCpu>[2], expected, catalog);
            });
            await announce(played);
            deciderChanged(played, before);
            countLater('commands');
            if (outcome.finished) countLater('matchesFinished');
        } catch (error) {
            // Someone else changed the match first: its new view schedules the next move.
            if (!(error instanceof RoomError)) console.error('cpu move failed', error instanceof Error ? error.message : error);
        }
    }
    /** Who was online in each of those rooms when its views were last sent. */
    const told = new Map<string, string>();
    // One wake-up per timed room, not a per-second broadcast or Redis write.
    const turnTimers = new Map<string, { version: number; deadline: number; timer: ReturnType<typeof setTimeout> }>();
    function scheduleTurn(room: Room, retryAfter = 0) {
        const deadline = room.status === 'playing' ? room.turnClock?.deadline : null;
        const previous = turnTimers.get(room.id);
        if (previous && previous.version > room.version) return;
        if (previous && previous.deadline === deadline && !retryAfter) { previous.version = room.version; return; }
        if (previous) clearTimeout(previous.timer);
        turnTimers.delete(room.id);
        if (stopping || deadline == null) return;
        const timer = setTimeout(() => {
            turnTimers.delete(room.id);
            void expireRoomTurn(room.id);
        }, Math.max(retryAfter, deadline - Date.now(), 0));
        timer.unref();
        turnTimers.set(room.id, { version: room.version, deadline, timer });
    }
    async function expireRoomTurn(id: string) {
        try {
            for (let attempt = 0; attempt < 6 && !stopping; attempt++) {
                const room = await backend.get(id);
                if (!room) return;
                const expected = room.version, before = decider(room), outcome = expireTurn(room, catalog);
                if (!outcome) { scheduleTurn(room); return; }
                room.version++;
                if (!await backend.replace(room, expected, lifetime(room))) continue;
                await announce(room);
                deciderChanged(room, before);
                countLater('commands');
                if (outcome.finished) countLater('matchesFinished');
                return;
            }
        } catch (error) {
            console.error('turn clock failed', error instanceof Error ? error.message : 'unavailable');
        }
        // A temporary backend failure must not lose the deadline or spin on an overdue clock.
        const room = await backend.get(id).catch(() => null);
        if (room) scheduleTurn(room, 1000);
    }
    let serial = 0;
    const socketsOf = (id: string) => {
        let pair = sockets.get(id);
        if (!pair) sockets.set(id, pair = [new Set(), new Set(), new Set(), new Set()]);
        return pair;
    };
    const connections = () => Array.from(sockets.values()).reduce((sum, pair) => sum + pair[0].size + pair[1].size + pair[2].size + pair[3].size, 0);
    const sentViews = new WeakMap<WebSocket, number>();
    const tell = (socket: WebSocket, message: ServerMessage) => {
        if (socket.readyState !== socket.OPEN) return;
        // Concurrent presence/publication can finish out of order. The browser
        // already ignores old versions; avoid compressing and sending them too.
        if (message.type === 'view') {
            const previous = sentViews.get(socket);
            if (previous !== undefined && message.view.version <= previous) return;
            sentViews.set(socket, message.view.version);
        }
        // A reader that stops receiving must not accumulate an unlimited send queue.
        if (socket.bufferedAmount > 256 * 1024) return socket.terminate();
        socket.send(JSON.stringify(message.type === 'view' ? { ...message, view: names.view(message.view) } : message));
    };

    /** Changes the room: `change` edits it (or throws RoomError). Tried again when another request got in first. */
    async function update<T>(id: string, change: (room: Room) => T, timing?: CommandTiming): Promise<{ room: Room; result: T }> {
        for (let attempt = 0; attempt < 6; attempt++) {
            let at = performance.now();
            const room = await backend.get(id);
            if (timing) timing.read += performance.now() - at;
            if (!room) throw new RoomError(404, GONE);
            at = performance.now();
            const expected = room.version, result = change(room);
            room.version++;
            if (timing) timing.apply += performance.now() - at;
            at = performance.now();
            const replaced = await backend.replace(room, expected, lifetime(room));
            if (timing) timing.store += performance.now() - at;
            if (replaced) return { room, result };
        }
        throw new RoomError(503, '混み合っています。もう一度お試しください');
    }
    /** Tells the player of `seat` by a push notification, unless their page is open and in front. */
    function tellIfAway(room: Room, seat: Side, notice: Notice) {
        const uid = room.seats[seat]?.profileId, member = room.seats[seat]?.member;
        if (!uid || !push.enabled) return;
        void (async () => {
            const here = member ? onlineMembers(await present(room.id)).has(member) : (await backend.online(room.id))[seat];
            if (here && !await push.store.away(room.id, member ?? seat)) return;
            push.later(uid, notice);
        })().catch(error => console.error('push failed', error instanceof Error ? error.message : 'unknown'));
    }
    /** After a change of the match: whoever has to act now (and did not before) is told. */
    function deciderChanged(room: Room, before: Side | null) {
        const now = decider(room);
        if (now === null || now === before) return;
        // Choices answered in quick succession make one notification.
        void push.store.once(`turn:${room.id}:${now}`, 10_000).then(first => { if (first) tellIfAway(room, now, notices.turn(room, now)); }, () => {});
    }
    const present = (id: string): Promise<Present> => backend.presence(id);
    const key = ({ online, watching, members }: Present) => `${online.join()}:${watching}:${[...members ?? []].sort().join()}`;
    /** Ends the sockets here of a seat (or of the whole room, with its spectators and members) that has no room any more. */
    function dismiss(id: string, seat?: Side) {
        const pair = sockets.get(id);
        if (!pair) return;
        for (const index of seat === undefined ? [0, 1, 2, 3] as const : [seat]) {
            for (const socket of Array.from(pair[index])) {
                tell(socket, { type: 'gone', error: GONE });
                socket.close(4404);
            }
        }
    }
    /** Ends the sockets here of plaza members who are no longer in it (null: all of them, the room closed). */
    function dismissMembers(id: string, members: string[] | null, closed = false) {
        const pair = sockets.get(id);
        if (!pair) return;
        for (const socket of Array.from(pair[3])) {
            if (!socket.entry || members && !members.includes(memberOfEntry(socket.entry.member))) continue;
            tell(socket, { type: 'gone', error: closed ? CLOSED : LEFT, ...(closed && { closed: true as const }) });
            socket.close(4404);
        }
    }
    /** Sends each seat's view (and the spectators' and members' views) to the sockets held here. */
    function deliver({ room, online, watching, members }: Pick<RoomEvent, 'room' | 'online' | 'watching' | 'members'>) {
        scheduleTurn(room);
        const pair = sockets.get(room.id);
        if (!pair) return;
        told.set(room.id, key({ online, watching, members }));
        if (room.plaza) {
            scheduleCpu(room);
            const here = new Set(members ?? []), views = new Map<string, ServerMessage>();
            for (const socket of Array.from(pair[3])) {
                const member = socket.entry && memberOfEntry(socket.entry.member);
                if (!member || !room.plaza.members.some(other => other.id === member)) continue;
                let message = views.get(member);
                if (!message) views.set(member, message = { type: 'view', view: plazaView(room, member, here, catalog) });
                tell(socket, message);
            }
            return;
        }
        for (const spot of [0, 1, 2] as const) {
            if (spot !== 2 && !room.seats[spot] || !pair[spot].size) continue;
            const message: ServerMessage = { type: 'view', view: seatView(room, spot === 2 ? 'spectator' : spot, { online, watching }) };
            for (const socket of Array.from(pair[spot])) tell(socket, message);
        }
    }
    /** After a change: the sockets here get their views, and the other instances are told to send theirs. */
    async function announce(room: Room, vacated?: Side, timing?: CommandTiming, removed?: string[]) {
        let at = performance.now();
        const now = await present(room.id);
        if (timing) timing.presence += performance.now() - at;
        at = performance.now();
        deliver({ room, ...now });
        if (room.plaza && room.status === 'closed') dismissMembers(room.id, null, true);
        else if (removed?.length) dismissMembers(room.id, removed);
        if (timing) timing.deliver += performance.now() - at;
        at = performance.now();
        await backend.publish({ from: pod, room, ...now, ...(vacated !== undefined && { dismiss: vacated }), ...(removed?.length && { dismissMembers: removed }) });
        if (timing) timing.publish += performance.now() - at;
    }
    const ready = backend.subscribe(event => {
        if (event.from === pod) return;
        deliver(event);
        if (event.dismiss !== undefined) dismiss(event.room.id, event.dismiss);
        if (event.room.plaza && event.room.status === 'closed') dismissMembers(event.room.id, null, true);
        else if (event.dismissMembers) dismissMembers(event.room.id, event.dismissMembers);
    });

    let overview: { at: number; value: Promise<Overview> } | undefined;
    const counts = () => {
        if (!overview || Date.now() - overview.at > OVERVIEW_AGE) overview = { at: Date.now(), value: backend.overview() };
        return overview.value;
    };
    async function stats(): Promise<RoomServerStats> {
        return { version, uptime: Math.round((Date.now() - started) / 1000), backend: backend.kind, ...await counts(), latency: latency.snapshot(), performance: await performanceMetrics.snapshot() };
    }

    const send = async (response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
        const text = body === undefined ? '' : JSON.stringify(await names.response(body));
        const compressed = text.length > 4096 && /\bgzip\b/.test(String(response.req.headers['accept-encoding'] ?? ''));
        response.writeHead(status, { ...(text && { 'content-type': 'application/json; charset=utf-8' }), ...(compressed && { 'content-encoding': 'gzip' }), 'cache-control': 'no-store', ...headers });
        response.end(compressed ? gzipSync(text) : text);
    };
    const address = (request: IncomingMessage) => clientAddress(request, trustProxy);
    const originAllowed = (origin: string | undefined) => origins.includes('*') || !!origin && origins.includes(origin);
    const seated = async (room: Room, seat: Side, token: string): Promise<Seated> => ({ seat, token, view: seatView(room, seat, await present(room.id)) });

    // ── Plazas ──
    /** The Firebase ID token the request was signed in with (already verified by historyOwners). */
    const idToken = (request: IncomingMessage) => request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    /** Who is asking: their verified account (whose current public name they go by) or the name a guest gave. */
    async function visitorOf(owners: string[], name: unknown): Promise<Visitor> {
        const profileId = owners.find(owner => owner.startsWith('user:'))?.slice(5);
        if (profileId) await names.load(profileId, true);
        return { ...(profileId && { profileId }), ...(owners.length && { historyOwners: seatOwners(owners) }), name: profileId ? names.name({ name: '', profileId }) : playerName(name, 'ゲスト') };
    }
    /** Who is asking, when only whether they may enter matters (no name is read). */
    const askerOf = (owners: string[]): Visitor => ({ ...(owners.find(owner => owner.startsWith('user:')) && { profileId: owners.find(owner => owner.startsWith('user:'))!.slice(5) }), name: '' });
    /** Whether `visitor` may enter: friendship is read from Firestore as them, once per request. */
    async function mayEnter(room: Room, visitor: Visitor, token: string | undefined, invite: unknown, friends?: Set<string>) {
        const entry = entryOf(room, visitor, invite);
        if (entry === 'yes') return true;
        if (entry === 'no' || !token || !visitor.profileId) return false;
        friends ??= new Set(await friendsOf(token, visitor.profileId).catch(() => []));
        return entry.friendsOf.some(other => friends.has(other));
    }
    const entered = async (room: Room, member: string, token: string): Promise<Entered> => ({ token, view: plazaView(room, member, onlineMembers(await present(room.id)), catalog) });
    /** Stores a new plaza under a free id. */
    async function makeRoom(make: (id: string) => { room: Room; token: string }): Promise<{ room: Room; token: string }> {
        for (let attempt = 0; attempt < 8; attempt++) {
            const made = make(String(randomInt(10 ** ROOM_ID_LENGTH)).padStart(ROOM_ID_LENGTH, '0'));
            if (!await backend.create(made.room, lifetime(made.room))) continue;
            overview = undefined;
            await backend.count('roomsCreated');
            return made;
        }
        throw new RoomError(503, 'ルームを作れませんでした。もう一度お試しください');
    }
    /**
     * A new plaza, or (`plaza.from`: a closed room this browser was in) that room's successor: the
     * first to come back makes it, everyone else who was there enters it, so it is made only once.
     */
    async function makePlaza(body: Record<string, unknown>, visitor: Visitor): Promise<Entered> {
        const from = (body.plaza as PlazaRequest | undefined)?.from;
        const closed = from && isRoomId(from.id) ? await backend.get(from.id) : null;
        if (closed?.plaza && closed.status === 'closed' && formerOf(closed, from!.token)) {
            for (let attempt = 0; attempt < 4; attempt++) {
                const current = await backend.get(closed.id);
                if (!current?.plaza) break;
                const next = current.plaza.successor ? await backend.get(current.plaza.successor) : null;
                if (next?.plaza && next.status !== 'closed') {
                    const { room, result } = await update(next.id, target => admit(target, visitor));
                    await announce(room);
                    return entered(room, result.member.id, result.token);
                }
                if (current.plaza.successor) break;
                const made = await makeRoom(id => succeed(current, id, visitor));
                const expected = current.version;
                current.plaza.successor = made.room.id;
                current.version++;
                if (await backend.replace(current, expected, lifetime(current))) return entered(made.room, made.room.plaza!.members[0].id, made.token);
                // Someone else came back first: theirs is entered instead (this one closes unattended).
            }
        }
        const made = await makeRoom(id => createPlaza(id, body, visitor));
        return entered(made.room, made.room.plaza!.members[0].id, made.token);
    }
    /** Who is let in by name to which plazas, read again at most every few seconds. */
    let invitedIndex: { until: number; value: Promise<Map<string, string[]>> } | undefined;
    function invitations() {
        if (!invitedIndex || invitedIndex.until <= Date.now()) invitedIndex = { until: Date.now() + 5000, value: (async () => {
            const index = new Map<string, string[]>();
            for (const id of await backend.ids()) {
                const room = await backend.get(id).catch(() => null);
                if (!room?.plaza || room.status === 'closed') continue;
                for (const uid of room.plaza.allowed) if (!room.plaza.members.some(member => member.profileId === uid)) index.set(uid, [...index.get(uid) ?? [], id]);
            }
            return index;
        })() };
        return invitedIndex.value;
    }
    /** The plaza a signed-in person is in now, if any. */
    async function plazaOf(uid: string) {
        for (const id of await backend.ids()) {
            const room = await backend.get(id).catch(() => null);
            if (room?.plaza && room.status !== 'closed' && room.plaza.members.some(member => member.profileId === uid)) return room;
        }
        return null;
    }
    /** Tells a plaza member of something by a push notification, unless their page is open and in front. */
    function tellMember(room: Room, member: string, notice: Notice) {
        const uid = room.plaza?.members.find(other => other.id === member)?.profileId;
        if (!uid || !push.enabled) return;
        void (async () => {
            if (onlineMembers(await present(room.id)).has(member) && !await push.store.away(room.id, member)) return;
            push.later(uid, notice);
        })().catch(error => console.error('push failed', error instanceof Error ? error.message : 'unknown'));
    }
    /** The plaza routes under /rooms/ that are not one room. */
    async function plazaRequest(request: IncomingMessage, name: string) {
        const owners = await historyOwners(request), token = idToken(request);
        const uid = owners.find(owner => owner.startsWith('user:'))?.slice(5);
        const body = await readJson(request, MAX_BODY) as Record<string, unknown> | null;
        if (name === 'lookup') {
            const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter(isRoomId))].slice(0, MAX_LOOKUP) : [];
            const visitor = askerOf(owners), friends = token && uid ? new Set(await friendsOf(token, uid).catch(() => [])) : undefined;
            const rooms = await Promise.all(ids.map(async id => {
                const room = await backend.get(id);
                if (!room || room.status === 'closed') return null;
                if (!room.plaza) return { ...roomInfo(room), hostOnline: (await backend.online(id))[0] };
                return await mayEnter(room, visitor, token, null, friends) ? plazaInfo(room) : null;
            }));
            return { rooms: rooms.filter(room => room !== null) };
        }
        if (!uid || !token) throw new RoomError(401, 'ログインすると使えます');
        if (name === 'invited') {
            const ids = (await invitations()).get(uid) ?? [];
            const rooms = await Promise.all(ids.slice(0, MAX_LOOKUP).map(id => backend.get(id)));
            return { rooms: rooms.flatMap(room => room?.plaza && room.status !== 'closed' && room.plaza.allowed.includes(uid) ? [plazaInfo(room)] : []) };
        }
        if (name === 'ask') {
            const to = typeof body?.to === 'string' ? body.to : '';
            const friendship = await friendshipBetween(token, uid, to);
            if (friendship?.status !== 'accepted') throw new RoomError(409, 'フレンドの状態が変わっています');
            const room = await plazaOf(to);
            const visitor = { ...await visitorOf(owners, ''), profileId: uid };
            // Nothing tells whether the friend is in a room, or which: only those in it learn of the request.
            if (room && await push.store.once(`ask:${room.id}:${uid}`, 60_000)) {
                try {
                    const { room: asked, result } = await update(room.id, target => askToEnter(target, visitor));
                    if (result) {
                        await announce(asked);
                        const plaza = asked.plaza!, notice = notices.asked(visitor.name, asked.id);
                        for (const member of plaza.members) if (plaza.visibility === 'invitePlus' || plaza.owner === member.id) tellMember(asked, member.id, notice);
                    }
                } catch (error) { if (!(error instanceof RoomError)) throw error; }
            }
            return { ok: true };
        }
        throw new RoomError(404, 'not found');
    }

    const server = createServer(async (request, response) => {
        const { origin } = request.headers;
        if (origins.includes('*')) response.setHeader('access-control-allow-origin', '*');
        else if (origin && origins.includes(origin)) {
            response.setHeader('access-control-allow-origin', origin);
            response.setHeader('vary', 'origin');
        }
        try {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
            const route = `${request.method} ${path}`, [, id, tail] = /^\/rooms\/([^/]+)(\/join)?$/.exec(path) ?? [];
            if (request.method === 'OPTIONS') {
                return send(response, 204, undefined, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type,authorization,x-history-key', 'access-control-max-age': '86400' });
            }
            if (route === 'GET /healthz') return send(response, 200, { ok: true });
            if (route === 'GET /readyz') return await backend.ping() ? send(response, 200, { ok: true }) : send(response, 503, { ok: false });
            if (route === 'GET /free-match/live') {
                if (!activityAllowed(address(request))) throw new RoomError(429, '少し待ってからお試しください');
                if (!activityCache || activityCache.until <= Date.now()) {
                    activityLoading ??= freeMatchActivity(backend).then(value => { activityCache = { value, until: Date.now() + 3000 }; return value; }).finally(() => { activityLoading = undefined; });
                    return send(response, 200, await activityLoading);
                }
                return send(response, 200, activityCache.value);
            }
            if (route === 'GET /stats') return send(response, 200, await stats());
            const image = request.method === 'GET' ? /^\/history\/assets\/([\da-f]{64})$/.exec(path) : null;
            if (image && history) {
                const asset = await history.asset(image[1]);
                if (!asset) throw new RoomError(404, '画像が見つかりません');
                response.writeHead(200, { 'content-type': asset.mime, 'cache-control': 'public,max-age=31536000,immutable', 'x-content-type-options': 'nosniff' });
                return response.end(Buffer.from(asset.data, 'base64'));
            }
            if (request.method === 'POST' && path.startsWith('/history')) {
                if (!history) throw new RoomError(503, '履歴の保存機能を準備しています');
                if (!allowed(address(request))) throw new RoomError(429, '少し待ってからお試しください');
                const owners = await historyOwners(request);
                if (!owners.length) throw new RoomError(401, 'この端末の履歴を確認できません');
                const body = await readJson(request, MAX_BODY) as Record<string, unknown> | null;
                if (path === '/history/list') {
                    if (owners.some(owner => owner.startsWith('user:'))) await history.linkGuest(owners);
                    if (body?.cursor !== undefined && (typeof body.cursor !== 'string' || body.cursor.length > 300)) throw new RoomError(400, 'ページが正しくありません');
                    return send(response, 200, await history.list(owners, body?.cursor as string | undefined, body?.favorites === true));
                }
                const match = /^\/history\/([\da-f-]{36})(\/favorite|\/detail)?$/.exec(path);
                if (!match) throw new RoomError(404, '履歴が見つかりません');
                if (match[2] === '/favorite') {
                    if (typeof body?.value !== 'boolean') throw new RoomError(400, 'お気に入りの指定が正しくありません');
                    if (!await history.favorite(owners, match[1], body.value)) throw new RoomError(404, '履歴が見つかりません');
                    return send(response, 200, { ok: true });
                }
                const recording = await (match[2] === '/detail' ? history.detail(owners, match[1]) : history.recording(owners, match[1]));
                if (!recording) throw new RoomError(404, '履歴が見つかりません');
                return send(response, 200, recording);
            }
            if (request.method === 'GET' && path === '/push/key') return send(response, 200, { publicKey: push.publicKey });
            if (request.method === 'POST' && path.startsWith('/push/')) return send(response, 200, await pushRequest(request, path));
            const freeOperation = request.method === 'POST' ? /^\/free-match\/(start|status|cancel)$/.exec(path)?.[1] as 'start' | 'status' | 'cancel' | undefined : undefined;
            if (freeOperation) {
                const owners = freeOperation === 'start' ? await historyOwners(request) : undefined;
                if (history && freeOperation === 'start' && !owners?.length) throw new RoomError(426, '画面を更新してから、もう一度お試しください');
                let body = await readJson(request, MAX_BODY);
                const profileId = owners?.find(owner => owner.startsWith('user:'))?.slice(5);
                if (profileId) {
                    await names.load(profileId, true);
                    if (body && typeof body === 'object') body = { ...body, name: names.name({ name: '', profileId }) };
                }
                const result = await freeMatch(backend, catalog, freeOperation, body, {
                    maxRooms, roomTtl: idleHours * HOUR, allowSpectators: await backend.audienceReady(), mayStart: () => allowed(address(request)),
                    owners: owners && seatOwners(owners),
                });
                if (result.created) {
                    // The player who was waiting (seat 0) may have put the phone away meanwhile.
                    push.later(result.created.seats[0]!.profileId, notices.freeMatched(result.created.seats[1]?.name ?? '相手'));
                    overview = undefined;
                    await backend.count('roomsCreated');
                    await backend.count('matchesStarted');
                }
                return send(response, 200, result.status);
            }
            if (route !== 'POST /rooms' && !id) return send(response, 404, { error: 'not found' });
            if (request.method === 'POST' && !tail && (id === 'lookup' || id === 'ask' || id === 'invited')) {
                if (!activityAllowed(address(request))) throw new RoomError(429, '少し待ってからお試しください');
                return send(response, 200, await plazaRequest(request, id));
            }
            if (!allowed(address(request))) throw new RoomError(429, '操作が多すぎます。しばらく待ってからお試しください');
            if (route === 'POST /rooms') {
                if (!mayCreate(address(request))) throw new RoomError(429, 'ルームを作りすぎています。しばらく待ってからお試しください');
                const { rooms } = await counts();
                if (rooms.lobby + rooms.playing + rooms.finished + rooms.closed >= maxRooms) throw new RoomError(503, 'いまはルームがいっぱいです。しばらく待ってからお試しください');
                let body = await readJson(request, MAX_BODY);
                const owners = await historyOwners(request);
                const profileId = owners.find(owner => owner.startsWith('user:'))?.slice(5);
                if (profileId) {
                    await names.load(profileId, true);
                    if (body && typeof body === 'object') body = { ...body, name: names.name({ name: '', profileId }) };
                }
                if (history && !owners.length) throw new RoomError(426, '画面を更新してから、もう一度お試しください');
                if (body && typeof body === 'object' && 'plaza' in body) return send(response, 200, await makePlaza(body as Record<string, unknown>, await visitorOf(owners, (body as { name?: unknown }).name)));
                for (let attempt = 0; attempt < 8; attempt++) {
                    const made = createRoom(String(randomInt(10 ** ROOM_ID_LENGTH)).padStart(ROOM_ID_LENGTH, '0'), body);
                    if (owners.length) made.room.seats[0]!.historyOwners = seatOwners(owners);
                    made.room.seats[0]!.profileId = owners.find(owner => owner.startsWith('user:'))?.slice(5);
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
                if (room.plaza) {
                    const owners = await historyOwners(request), invite = new URL(request.url ?? '/', 'http://localhost').searchParams.get('invite');
                    if (!await mayEnter(room, askerOf(owners), idToken(request), invite)) throw new RoomError(404, HIDDEN);
                    return send(response, 200, plazaInfo(room));
                }
                return send(response, 200, { ...roomInfo(room), hostOnline: (await backend.online(room.id))[0] });
            }
            const existing = request.method === 'POST' && tail ? await backend.get(id) : null;
            if (existing?.plaza) {
                const body = await readJson(request, MAX_BODY) as Record<string, unknown> | null;
                const owners = await historyOwners(request);
                if (history && !owners.length) throw new RoomError(426, '画面を更新してから、もう一度お試しください');
                const visitor = await visitorOf(owners, body?.name);
                if (existing.status === 'closed') throw new RoomError(410, CLOSED);
                // A member whose moment away ran out comes back in (the owner's role is not given back).
                if (!formerOf(existing, body?.rejoin) && !await mayEnter(existing, visitor, idToken(request), body?.invite)) throw new RoomError(404, HIDDEN);
                const { room, result } = await update(id, target => admit(target, visitor));
                await announce(room);
                // Someone waiting alone (perhaps in Discord, sharing the link) learns that a friend came.
                if (room.plaza!.members.length === 2) for (const member of room.plaza!.members) if (member.id !== result.member.id) tellMember(room, member.id, notices.arrived(visitor.name, room.id));
                return send(response, 200, await entered(room, result.member.id, result.token));
            }
            if (request.method === 'POST' && tail) {
                let body = await readJson(request, MAX_BODY);
                const owners = await historyOwners(request);
                const profileId = owners.find(owner => owner.startsWith('user:'))?.slice(5);
                if (profileId) {
                    await names.load(profileId, true);
                    if (body && typeof body === 'object') body = { ...body, name: names.name({ name: '', profileId }) };
                }
                if (history && !owners.length) throw new RoomError(426, '画面を更新してから、もう一度お試しください');
                const { room, result: token } = await update(id, target => {
                    const token = joinRoom(target, body);
                    if (owners.length) target.seats[1]!.historyOwners = seatOwners(owners);
                    target.seats[1]!.profileId = owners.find(owner => owner.startsWith('user:'))?.slice(5);
                    return token;
                });
                await announce(room);
                tellIfAway(room, 0, notices.joined(room));
                return send(response, 200, await seated(room, 1, token));
            }
            return send(response, 404, { error: 'not found' });
        } catch (error) {
            if (error instanceof HttpError) {
                if (error.close) response.once('finish', () => request.destroy());
                return send(response, error.status, { error: error.message }, error.close ? { connection: 'close' } : {});
            }
            if (error instanceof RoomError) return send(response, error.status, { error: error.message });
            console.error('request failed', error);
            return send(response, 500, { error: 'サーバーで問題が起きました。少し待ってからお試しください' });
        }
    });

    /** The /push/ requests: all need a signed-in player. */
    async function pushRequest(request: IncomingMessage, path: string) {
        if (!allowed(address(request))) throw new RoomError(429, '少し待ってからお試しください');
        const uid = (await historyOwners(request)).find(owner => owner.startsWith('user:'))?.slice(5);
        if (!uid) throw new RoomError(401, 'ログインすると通知を受け取れます');
        const token = request.headers.authorization!.slice(7);
        const body = await readJson(request, MAX_BODY) as Record<string, unknown> | null;
        if (path === '/push/subscribe') {
            const parsed = subscription.safeParse(body?.subscription);
            if (!parsed.success) throw new RoomError(400, 'この通知先は使えません');
            await push.store.add(uid, parsed.data);
            return { ok: true, enabled: push.enabled };
        }
        if (path === '/push/unsubscribe') {
            if (typeof body?.endpoint !== 'string' || body.endpoint.length > 1024) throw new RoomError(400, '通知先が正しくありません');
            await push.store.remove(uid, body.endpoint);
            return { ok: true };
        }
        const nameOf = async (profileId: string) => { await names.load(profileId, true); return names.name({ name: '', profileId }); };
        if (path === '/push/friend') {
            const to = typeof body?.to === 'string' ? body.to : '', kind = body?.kind;
            if (kind !== 'request' && kind !== 'accepted') throw new RoomError(400, '通知の種類が正しくありません');
            const friendship = await friendshipBetween(token, uid, to);
            // Only what really happened: the request is the sender's, the acceptance the other's.
            const real = kind === 'request' ? friendship?.status === 'pending' && friendship.requestedBy === uid : friendship?.status === 'accepted' && friendship.requestedBy === to;
            if (!real) throw new RoomError(409, 'フレンドの状態が変わっています');
            if (await push.store.once(`friend:${kind}:${[uid, to].sort().join('~')}`, 7 * 24 * HOUR)) {
                const name = await nameOf(uid);
                push.later(to, kind === 'request' ? notices.friendRequest(name) : notices.friendAccepted(name));
            }
            return { ok: true };
        }
        if (path === '/push/recruit') {
            const roomId = typeof body?.roomId === 'string' ? body.roomId : '';
            const room = isRoomId(roomId) ? await backend.get(roomId) : null;
            if (!room || room.plaza || room.status !== 'lobby' || room.seats[1] || room.seats[0]!.profileId !== uid || await recruitmentOf(token, uid) !== roomId) throw new RoomError(409, '募集しているルームが見つかりません');
            if (await push.store.once(`recruit:${uid}:${roomId}`, 12 * HOUR)) {
                const notice = notices.recruit(await nameOf(uid), roomId);
                for (const friend of await friendsOf(token, uid)) push.later(friend, notice);
            }
            return { ok: true };
        }
        throw new RoomError(404, 'not found');
    }

    server.maxConnections = 2048;
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    const socketAttempts = limiter(120, 60_000);
    const perAddress = new Map<string, number>();
    let pendingActions = 0;
    const wss = new WebSocketServer({
        noServer: true, maxPayload: MAX_BODY,
        // Large redacted views dominate a mobile connection. Keep small results uncompressed
        // and bound zlib work/memory; each message has its own compression context.
        perMessageDeflate: {
            threshold: 2048, concurrencyLimit: 4,
            serverNoContextTakeover: true, clientNoContextTakeover: true,
            serverMaxWindowBits: 12,
            zlibDeflateOptions: { level: 3, memLevel: 5 },
        },
    });
    server.on('upgrade', (request, socket, head) => {
        try {
            const [, id] = /^\/rooms\/(\d+)\/socket\/?$/.exec(new URL(request.url ?? '/', 'http://localhost').pathname) ?? [];
            if (!id || !isRoomId(id) || !originAllowed(request.headers.origin)) return socket.destroy();
            const ip = address(request);
            if (wss.clients.size >= 2048 || (perAddress.get(ip) ?? 0) >= 128 || !socketAttempts(ip)) return socket.destroy();
            wss.handleUpgrade(request, socket, head, connection => attach(connection, id, ip));
        } catch { socket.destroy(); }
    });
    /** The other side learns that a player came or went (the room gets a new version for it). */
    async function presenceChanged(id: string) {
        try {
            const now = await present(id);
            const { room } = await update(id, target => { target.last = null; notePresence(target, onlineMembers(now), Date.now()); });
            await announce(room);
        } catch (error) {
            if (!(error instanceof RoomError)) throw error;
        }
    }
    function attach(socket: Attached, id: string, ip: string) {
        perAddress.set(ip, (perAddress.get(ip) ?? 0) + 1);
        const messageAllowed = burstLimit(30, 10);
        let queued = 0, helloStarted = false;
        const reportable = new Map<number, { kind: PlayKind; timing: ServerTiming; at: number }>();
        const metricAllowed = burstLimit(2, 10);
        socket.alive = true;
        socket.on('pong', () => { socket.alive = true; });
        const impatient = setTimeout(() => socket.close(4408), HELLO_TIMEOUT);
        // One thing at a time per socket, in the order it happened (also its closing).
        let work = Promise.resolve();
        const next = (task: () => Promise<void>, cleanup = false) => {
            if (!cleanup && (queued >= 8 || pendingActions >= 128)) { socket.close(4408); return; }
            queued++; pendingActions++;
            work = work.then(async () => { if (cleanup || socket.readyState === socket.OPEN) await task(); })
                .catch(error => { console.error('socket failed', error); socket.close(1011); })
                .finally(() => { queued--; pendingActions--; });
        };

        /** A plaza member's socket: they are in the room wherever they are, seated or not. */
        async function enterPlaza(room: Room, token: unknown) {
            const member = room.status === 'closed' ? null : memberOf(room, token);
            if (!member) {
                // Who was in a room that closed (everyone was away) may make its successor.
                const closed = room.status === 'closed' && formerOf(room, token);
                tell(socket, { type: 'gone', error: room.status === 'closed' ? CLOSED : LEFT, ...(closed && { closed: true as const }) });
                return socket.close(4404);
            }
            if (socket.readyState !== socket.OPEN) return;
            const mine = Array.from(socketsOf(id)[3]).filter(other => other.entry && memberOfEntry(other.entry.member) === member.id);
            if (mine.length >= 4) return socket.close(4408);
            socket.entry = { id, seat: 'm', member: `${member.id}~${pod}:${++serial}` };
            socketsOf(id)[3].add(socket);
            if (await backend.enter(socket.entry, presenceTtl) || member.away !== undefined) await presenceChanged(id);
            else {
                const now = await present(id);
                if (!told.has(id)) told.set(id, key(now));
                tell(socket, { type: 'view', view: plazaView(room, member.id, onlineMembers(now), catalog) });
            }
        }
        async function hello(token: unknown) {
            clearTimeout(impatient);
            const room = await backend.get(id);
            if (room?.plaza) return enterPlaza(room, token);
            const seat = room ? seatOf(room, token) : null;
            if (!room || seat === null) {
                tell(socket, { type: 'gone', error: room ? 'このルームの参加者ではありません' : GONE });
                return socket.close(4404);
            }
            if (socket.readyState !== socket.OPEN) return;
            if (socketsOf(id)[seat].size >= 4) return socket.close(4408);
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
            // A plaza is watched by entering it.
            const refusal = !room || room.plaza ? GONE : !room.rules.spectators ? 'このルームは観戦できません' : await backend.watching(id) >= MAX_SPECTATORS ? '観戦している人がいっぱいです' : null;
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
        async function plazaAction(n: number, body: unknown, received: number) {
            const member = memberOfEntry(socket.entry!.member), timing = commandTiming();
            timing.queue = performance.now() - received;
            try {
                let before: Side | null = null;
                const { room, result: outcome } = await update(id, target => {
                    if (!target.plaza) throw new RoomError(404, GONE);
                    before = decider(target);
                    return actPlaza(target, member, body, catalog);
                }, timing);
                const sent = body as RoomAction;
                const measured = outcome.command && sent.action === 'command' && isPlayKind(sent.command.type) ? parseServerTiming(timing) : undefined;
                if (measured && sent.action === 'command' && isPlayKind(sent.command.type)) {
                    reportable.set(n, { kind: sent.command.type, timing: measured, at: Date.now() });
                    if (reportable.size > 64) reportable.delete(reportable.keys().next().value!);
                }
                // Whoever leaves is told the result before their sockets are ended.
                if (outcome.removed?.includes(member)) tell(socket, { type: 'result', n });
                await announce(room, undefined, timing, outcome.removed);
                timing.total = performance.now() - received;
                if (!outcome.removed?.includes(member)) tell(socket, { type: 'result', n, ...(measured && { timing: measured, revision: room.state?.revision }) });
                if (outcome.command) latency.record(timing);
                if (outcome.started) countLater('matchesStarted');
                if (outcome.finished) countLater('matchesFinished');
                if (outcome.command) countLater('commands');
                deciderChanged(room, before);
                if (outcome.invited) push.later(outcome.invited, notices.invited(room.plaza!.members.find(other => other.id === member)?.name ?? 'フレンド', room.id));
            } catch (error) {
                if (!(error instanceof RoomError)) console.error('action failed', error);
                tell(socket, { type: 'result', n, error: error instanceof RoomError ? error.message : 'サーバーで問題が起きました' });
            }
        }
        async function action(n: number, body: unknown, received: number) {
            const { seat } = socket.entry!;
            if (seat === 'm') return plazaAction(n, body, received);
            if (seat === 2) return tell(socket, { type: 'result', n, error: '観戦中は操作できません' });
            const timing = commandTiming();
            timing.queue = performance.now() - received;
            try {
                let before: Side | null = null;
                const { room, result: outcome } = await update(id, target => {
                    if (!target.seats[seat] || target.plaza) throw new RoomError(404, GONE);
                    before = decider(target);
                    return act(target, seat, body, catalog);
                }, timing);
                // The view goes out before the result, so whoever waits for the result already has it.
                await announce(room, outcome.vacated ? seat : undefined, timing);
                timing.total = performance.now() - received;
                const command = body as RoomAction;
                const measured = outcome.command && command.action === 'command' && isPlayKind(command.command.type) ? parseServerTiming(timing) : undefined;
                if (measured && command.action === 'command' && isPlayKind(command.command.type)) {
                    reportable.set(n, { kind: command.command.type, timing: measured, at: Date.now() });
                    if (reportable.size > 64) reportable.delete(reportable.keys().next().value!);
                }
                tell(socket, { type: 'result', n, ...(measured && { timing: measured, revision: room.state?.revision }) });
                if (outcome.command) latency.record(timing);
                if (outcome.started) countLater('matchesStarted');
                if (outcome.finished) countLater('matchesFinished');
                if (outcome.command) countLater('commands');
                if (outcome.vacated) dismiss(id, seat);
                deciderChanged(room, before);
            } catch (error) {
                if (!(error instanceof RoomError)) console.error('action failed', error);
                tell(socket, { type: 'result', n, error: error instanceof RoomError ? error.message : 'サーバーで問題が起きました' });
            }
        }
        socket.on('message', data => {
            if (!messageAllowed()) return socket.close(4408);
            const received = performance.now();
            let message: ClientMessage;
            try { message = JSON.parse(String(data)) as ClientMessage; } catch { return socket.close(4400); }
            if (message?.type === 'hello' && !helloStarted) {
                helloStarted = true;
                return next(() => message.watch ? watch() : hello(message.token));
            }
            if (message?.type === 'performance') {
                if (!socket.entry || socket.entry.seat === 2 || !metricAllowed() || !Array.isArray(message.reports) || message.reports.length > 8) return;
                for (const item of message.reports) {
                    const report = parsePlayReport(item), issued = report && reportable.get(report.n);
                    if (!report || !issued || Date.now() - issued.at > 120_000) continue;
                    reportable.delete(report.n);
                    const { background, inputToSend, roundTrip, sendToView, viewToPaint, inputToPaint } = report;
                    const durations = { background, inputToSend, roundTrip, sendToView, viewToPaint, inputToPaint };
                    performanceMetrics.record({ ...durations, kind: issued.kind, server: issued.timing, at: Math.floor(Date.now() / 60000) * 60000, outcome: 'ok' });
                }
                return;
            }
            if (message?.type === 'away' && typeof message.away === 'boolean') {
                const away = message.away, entry = socket.entry;
                if (entry && entry.seat !== 2) void push.store.setAway(id, entry.seat === 'm' ? memberOfEntry(entry.member) : entry.seat, away, idleHours * HOUR).catch(() => {});
                return;
            }
            if (message?.type !== 'action' || !Number.isSafeInteger(message.n) || message.n < 0) return socket.close(4400);
            next(async () => { if (socket.entry) await action(message.n, message.action, received); });
        });
        socket.on('close', () => {
            const remaining = (perAddress.get(ip) ?? 1) - 1;
            if (remaining) perAddress.set(ip, remaining); else perAddress.delete(ip);
            clearTimeout(impatient);
            next(async () => {
                const { entry } = socket;
                if (!entry) return;
                socket.entry = undefined;
                const pair = socketsOf(id);
                pair[spotIndex(entry.seat)].delete(socket);
                if (!pair[0].size && !pair[1].size && !pair[2].size && !pair[3].size) { sockets.delete(id); told.delete(id); }
                // While shutting down the players are moving to another instance, not leaving.
                // A seat's last socket closing means the player went; every spectator counts.
                if ((await backend.leave(entry) || entry.seat === 2) && !stopping) await presenceChanged(id);
            }, true);
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
            await backend.audienceCapable(pod, presenceTtl);
            await Promise.all([backend.refresh(entries, presenceTtl), backend.beat(pod, connections(), presenceTtl)]);
            for (const id of Array.from(sockets.keys())) {
                const room = await backend.get(id);
                if (!room) dismiss(id);
                else if (key(await present(id)) !== told.get(id)) await presenceChanged(id);
                // A move whose instance went away is picked up here.
                else scheduleCpu(room);
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
            scheduleTurn(room);
            if (room.plaza) {
                if (room.status === 'closed') continue;
                const here = onlineMembers(await present(id));
                if (tidyPlaza(structuredClone(room), here, now) === null) continue;
                try {
                    const { room: tidied, result } = await update(id, target => tidyPlaza(target, here, now) ?? {} as PlazaOutcome);
                    if (result.finished) await backend.count('matchesFinished');
                    await announce(tidied, undefined, undefined, result.removed);
                } catch (error) {
                    if (!(error instanceof RoomError)) throw error;
                }
                continue;
            }
            const online = await backend.online(id);
            // Most rooms are as they were: they are not written again (it would keep them from expiring).
            if (tidy(structuredClone(room), online, now, patience) === null) continue;
            try {
                const { room: tidied, result } = await update(id, target => tidy(target, online, now, patience));
                if (result === 'finished') await backend.count('matchesFinished');
                if (result === 'closed' || result === 'vacated' || result === 'finished') await announce(tidied, result === 'vacated' ? 1 : undefined);
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
    server.on('close', () => { clearInterval(beats); clearInterval(pinging); for (const { timer } of turnTimers.values()) clearTimeout(timer); turnTimers.clear(); for (const { timer } of cpuTimers.values()) clearTimeout(timer); cpuTimers.clear(); void thinker.close(); });
    server.on('listening', () => { void ready.then(beat); });

    return Object.assign(server, {
        stats, beat,
        /**
         * Before stopping: this instance's sockets are no longer counted as present and are closed
         * (1012: the service restarts), and the browsers connect again, to another instance.
         */
        async shutdown() {
            performanceMetrics.close();
            stopping = true;
            clearInterval(beats);
            for (const { timer } of cpuTimers.values()) clearTimeout(timer);
            cpuTimers.clear();
            await thinker.close();
            for (const { timer } of turnTimers.values()) clearTimeout(timer);
            turnTimers.clear();
            const held = Array.from(wss.clients as Set<Attached>);
            const entries = held.flatMap(socket => socket.entry ? [socket.entry] : []);
            // Their closing has nothing left to do.
            for (const socket of held) socket.entry = undefined;
            await Promise.allSettled([...entries.map(entry => backend.leave(entry)), backend.forget(pod), ...counting]);
            for (const socket of held) socket.close(1012);
            wss.close();
        },
    });
}
