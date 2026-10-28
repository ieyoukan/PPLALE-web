// What every instance of the server shares, kept in Redis: the rooms, who is connected, the
// counters, and the channel on which an instance tells the others that a room changed. The
// instances themselves hold nothing but their sockets, so any of them can serve any room and one
// can be replaced without ending a match.
//
//   pplale:room:{id}        hash   json (the room), v (its version), st (its status); expires when idle
//   pplale:on:{id}:{spot}   zset   one member per open socket of a seat (0, 1), of the spectators (2) or of a plaza's members (m: `{member}~{socket}`), scored with when it lapses
//   pplale:claim:{key}      string taken by the first instance to claim it (one CPU move is decided once)
//   pplale:pod:{pod}        string that instance's socket count; lapses when the instance is gone
//   pplale:totals           hash   counters since the data began
//   pplale:rooms            channel
//
// Without Redis (development, tests) the same is kept in the process by `memoryBackend`.
import { createClient } from 'redis';
import type { HistoryCapture, HistoryWrite } from './history/repository.ts';
import type { Side } from '@pplale/game-core';
import type { RoomServerStats, RoomStatus } from '@pplale/game-core/room';
import type { Room } from './rooms.ts';
import type { FreeMatchQueue } from './matchmaking.ts';
import type { PlaySample } from '@pplale/game-core/performance';

/** A room changed. Every instance sends the views to the sockets it holds. */
export interface RoomEvent {
    /** Chat-only update: do not send or re-animate the match. */
    chat?: true;
    /** The instance that made the change (it has already told its own sockets). */
    from: string;
    room: Room;
    online: [boolean, boolean];
    watching: number;
    /** In a plaza: the members connected now. */
    members?: string[];
    /** That seat was given up: its sockets have no room any more. */
    dismiss?: Side;
    /** In a plaza: these members are no longer in it. */
    dismissMembers?: string[];
}
export type Totals = RoomServerStats['total'];
/** Where a socket is in a room: a seat, (2) among the spectators, or (m) a plaza's member wherever they are. */
export type Spot = Side | 2 | 'm';
/** One open socket. For a plaza member `member` is `{member id}~{socket}`, so that their sockets are counted together. */
export interface Member { id: string; seat: Spot; member: string }
/** The plaza member a socket entry belongs to. */
export const memberOfEntry = (entry: string) => entry.slice(0, entry.indexOf('~'));
const plazaMembers = (entries: string[]) => [...new Set(entries.map(memberOfEntry))];
export interface Overview { rooms: Record<RoomStatus, number>; total: Totals; pods: number; connections: number }

export interface Backend {
    appendPerformance(samples: PlaySample[]): Promise<void>;
    readPerformance(): Promise<PlaySample[]>;
    readonly kind: RoomServerStats['backend'];
    /** False when the id is taken. `ttl` (ms): how long the room lasts without another change. */
    create(room: Room, ttl: number, history?: HistoryCapture): Promise<boolean>;
    get(id: string): Promise<Room | null>;
    /** Ids of every room there is. */
    ids(): Promise<string[]>;
    /** Stores the room if it is still at version `expected`; false when someone else changed it first. */
    replace(room: Room, expected: number, ttl: number, history?: HistoryCapture): Promise<boolean>;
    freeMatchQueue(): Promise<FreeMatchQueue>;
    /** Commits the queue and, when paired, the new room together. Neither can be stored alone. */
    replaceFreeMatchQueue(queue: FreeMatchQueue, expected: number, room?: Room, roomTtl?: number, history?: HistoryCapture): Promise<boolean>;
    historyPending(): Promise<HistoryWrite[]>;
    historyAck(id: string): Promise<void>;
    historyCapable(pod: string, ttl: number): Promise<void>;
    historyReady(): Promise<boolean>;
    audienceCapable(pod: string, ttl: number): Promise<void>;
    audienceReady(): Promise<boolean>;
    publish(event: RoomEvent): Promise<void>;
    subscribe(listener: (event: RoomEvent) => void): Promise<void>;
    /** A socket of the seat opened. True when the seat had none (the player just came). */
    enter(entry: Member, ttl: number): Promise<boolean>;
    /** A socket of the seat closed. True when the seat has none left (the player is gone). */
    leave(entry: Member): Promise<boolean>;
    online(id: string): Promise<[boolean, boolean]>;
    /** All presence sets in one backend round trip (`members`: a plaza's members connected now). */
    presence(id: string): Promise<{ online: [boolean, boolean]; watching: number; members: string[] }>;
    /** True for the first caller to claim `key` within `ttl` ms. */
    claim(key: string, ttl: number): Promise<boolean>;
    /** Open sockets of spectators. */
    watching(id: string): Promise<number>;
    /** Says that these sockets are still open; one that is not refreshed lapses after `ttl`. */
    refresh(entries: Member[], ttl: number): Promise<void>;
    count(name: keyof Totals): Promise<void>;
    /** Says that the instance is running with this many sockets. */
    beat(pod: string, connections: number, ttl: number): Promise<void>;
    forget(pod: string): Promise<void>;
    overview(): Promise<Overview>;
    ping(): Promise<boolean>;
    close(): Promise<void>;
}

const noTotals = (): Totals => ({ roomsCreated: 0, matchesStarted: 0, matchesFinished: 0, commands: 0 });
const noRooms = (): Record<RoomStatus, number> => ({ lobby: 0, playing: 0, finished: 0, closed: 0 });

// KEYS[1] the room. ARGV: expected version ('' = must not exist), new version, json, status, ttl.
const STORE = `
local current = redis.call('HGET', KEYS[1], 'v')
if ARGV[1] == '' then
  if current then return 0 end
elseif current ~= ARGV[1] then return 0 end
local previous = redis.call('HGET', KEYS[1], 'json') or 'null'
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'json', ARGV[3], 'st', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
if ARGV[6] ~= '' then
  redis.call('XADD', KEYS[2], '*', 'room', ARGV[3], 'previous', previous, 'capture', ARGV[6], 'expires', ARGV[7])
end
return 1`;

// The version check, room-id reservation and both writes must be one Redis operation.
const STORE_FREE_MATCH = `
local current = redis.call('HGET', KEYS[1], 'v') or '0'
if current ~= ARGV[1] then return 0 end
if ARGV[4] ~= '' then
  if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
  redis.call('HSET', KEYS[2], 'v', '1', 'json', ARGV[4], 'st', 'playing')
  redis.call('PEXPIRE', KEYS[2], ARGV[5])
  if ARGV[6] ~= '' then
    redis.call('XADD', KEYS[3], '*', 'room', ARGV[4], 'previous', 'null', 'capture', ARGV[6], 'expires', ARGV[7])
  end
end
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'json', ARGV[3])
redis.call('PEXPIRE', KEYS[1], 600000)
return 1`;

// KEYS[1] a presence set. ARGV: the socket's lapse time, the socket, its ttl. The set outlives its longest-lived socket.
const MARK = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
if redis.call('PTTL', KEYS[1]) < tonumber(ARGV[3]) then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
return 1`;

// The seats and spectators are counted; a plaza's member entries are listed after the counts.
const PRESENCE = `
local result = {}
for i, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', ARGV[1])
  if i < 4 then result[i] = redis.call('ZCARD', key) end
end
for _, entry in ipairs(redis.call('ZRANGE', KEYS[4], 0, -1)) do table.insert(result, entry) end
return result`;

export async function redisBackend(url: string, prefix = 'pplale:'): Promise<Backend> {
    const client = createClient({ url });
    // Without a listener a dropped connection would end the process; the client connects again by itself.
    client.on('error', error => console.error('redis', error instanceof Error ? error.message : error));
    await client.connect();
    let subscriber: typeof client | undefined;
    const roomKey = (id: string) => `${prefix}room:${id}`, seatKey = (id: string, seat: Spot) => `${prefix}on:${id}:${seat}`;
    const channel = `${prefix}rooms`, totalsKey = `${prefix}totals`, podKey = (pod: string) => `${prefix}pod:${pod}`;
    const outbox = `${prefix}history-outbox`;
    const store = async (room: Room, expected: string, ttl: number, history?: HistoryCapture) =>
        await client.eval(STORE, { keys: [roomKey(room.id), outbox], arguments: [expected, String(room.version), JSON.stringify(room), room.status, String(Math.ceil(ttl)), history ? JSON.stringify(history) : '', String(Date.now() + ttl)] }) === 1;
    /** Open sockets of a seat, after dropping the ones whose instance stopped refreshing them. */
    const present = async (id: string, seat: Spot) => {
        await client.zRemRangeByScore(seatKey(id, seat), '-inf', Date.now());
        return client.zCard(seatKey(id, seat));
    };
    /** Open sockets of one plaza member. */
    const memberSockets = async (id: string, entry: string) => {
        await client.zRemRangeByScore(seatKey(id, 'm'), '-inf', Date.now());
        const prefix = `${memberOfEntry(entry)}~`;
        return (await client.zRange(seatKey(id, 'm'), 0, -1)).filter(value => value.startsWith(prefix)).length;
    };
    // A plaza's members share one key: a socket only ever lengthens its life, never cuts the others'.
    const mark = (entry: Member, ttl: number) => client.eval(MARK, { keys: [seatKey(entry.id, entry.seat)], arguments: [String(Date.now() + ttl), entry.member, String(Math.ceil(ttl))] });
    async function keys(pattern: string) {
        const found: string[] = [];
        for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 500 })) found.push(...(Array.isArray(batch) ? batch : [batch]));
        return found;
    }
    return {
        kind: 'redis',
        async appendPerformance(samples) {
            if (!samples.length) return;
            await client.multi().lPush(`${prefix}performance:v1`, samples.map(sample => JSON.stringify(sample))).lTrim(`${prefix}performance:v1`, 0, 2047).expire(`${prefix}performance:v1`, 86400).exec();
        },
        async readPerformance() {
            return (await client.lRange(`${prefix}performance:v1`, 0, 2047)).reverse().flatMap(json => { try { return [JSON.parse(json) as PlaySample]; } catch { return []; } });
        },
        create: (room, ttl, history) => store(room, '', ttl, history),
        async get(id) {
            const json = await client.hGet(roomKey(id), 'json');
            return json ? JSON.parse(json) as Room : null;
        },
        async ids() { return (await keys(roomKey('*'))).map(key => key.slice(roomKey('').length)); },
        replace: (room, expected, ttl, history) => store(room, String(expected), ttl, history),
        async freeMatchQueue() {
            const json = await client.hGet(`${prefix}free-match`, 'json');
            return json ? JSON.parse(json) as FreeMatchQueue : { version: 0, entries: {} };
        },
        async replaceFreeMatchQueue(queue, expected, room, roomTtl, history) {
            return await client.eval(STORE_FREE_MATCH, {
                keys: [`${prefix}free-match`, roomKey(room?.id ?? 'unused'), outbox],
                arguments: [String(expected), String(queue.version), JSON.stringify(queue), room ? JSON.stringify(room) : '', String(Math.ceil(roomTtl ?? 1)), history ? JSON.stringify(history) : '', String(Date.now() + (roomTtl ?? 1))],
            }) === 1;
        },
        async historyPending() {
            return ((await client.xRange(outbox, '-', '+', { COUNT: 100 })) ?? []).map(({ id, message }) => {
                const capture = JSON.parse(message.capture) as HistoryCapture;
                return { id, room: JSON.parse(message.room) as Room, previous: JSON.parse(message.previous) as Room | null, expires: Number(message.expires), capture: capture.snapshot, completeAllowed: capture.completeAllowed };
            });
        },
        async historyAck(id) { await client.xDel(outbox, id); },
        async historyCapable(pod, ttl) { await client.set(`${prefix}history-capable:${pod}`, '1', { PX: Math.ceil(ttl) }); },
        async audienceCapable(pod, ttl) { await client.set(`${prefix}audience-capable:${pod}`, '1', { PX: Math.ceil(ttl) }); },
        async audienceReady() {
            const pods = await keys(podKey('*'));
            return (await Promise.all(pods.map(key => client.exists(`${prefix}audience-capable:${key.slice(podKey('').length)}`)))).every(Boolean);
        },
        async historyReady() {
            const pods = await keys(podKey('*'));
            return (await Promise.all(pods.map(key => client.exists(`${prefix}history-capable:${key.slice(podKey('').length)}`)))).every(Boolean);
        },
        async publish(event) { await client.publish(channel, JSON.stringify(event)); },
        async subscribe(listener) {
            subscriber = client.duplicate();
            subscriber.on('error', error => console.error('redis (subscriber)', error instanceof Error ? error.message : error));
            await subscriber.connect();
            await subscriber.subscribe(channel, message => listener(JSON.parse(message) as RoomEvent));
        },
        async enter(entry, ttl) {
            const before = entry.seat === 'm' ? await memberSockets(entry.id, entry.member) : await present(entry.id, entry.seat);
            await mark(entry, ttl);
            return before === 0;
        },
        async leave(entry) {
            await client.zRem(seatKey(entry.id, entry.seat), entry.member);
            return (entry.seat === 'm' ? await memberSockets(entry.id, entry.member) : await present(entry.id, entry.seat)) === 0;
        },
        async online(id) {
            const [a, b] = await Promise.all([present(id, 0), present(id, 1)]);
            return [a > 0, b > 0];
        },
        async presence(id) {
            const counts = await client.eval(PRESENCE, { keys: ([0, 1, 2, 'm'] as Spot[]).map(seat => seatKey(id, seat)), arguments: [String(Date.now())] }) as (number | string)[];
            return { online: [Number(counts[0]) > 0, Number(counts[1]) > 0], watching: Number(counts[2]), members: plazaMembers(counts.slice(3).map(String)) };
        },
        async claim(key, ttl) { return await client.set(`${prefix}claim:${key}`, '1', { NX: true, PX: Math.ceil(ttl) }) === 'OK'; },
        watching: id => present(id, 2),
        async refresh(entries, ttl) { await Promise.all(entries.map(entry => mark(entry, ttl))); },
        async count(name) { await client.hIncrBy(totalsKey, name, 1); },
        async beat(pod, connections, ttl) { await client.set(podKey(pod), String(connections), { PX: Math.ceil(ttl) }); },
        async forget(pod) { await client.del(podKey(pod)); },
        async overview() {
            const [roomKeys, podKeys, counted] = await Promise.all([keys(roomKey('*')), keys(podKey('*')), client.hGetAll(totalsKey)]);
            const [statuses, sockets] = await Promise.all([Promise.all(roomKeys.map(key => client.hGet(key, 'st'))), Promise.all(podKeys.map(key => client.get(key)))]);
            const rooms = noRooms(), total = noTotals();
            for (const status of statuses) if (status && status in rooms) rooms[status as RoomStatus]++;
            for (const name of Object.keys(total) as (keyof Totals)[]) total[name] = Number(counted[name] ?? 0);
            return { rooms, total, pods: podKeys.length, connections: sockets.reduce((sum, value) => sum + Number(value ?? 0), 0) };
        },
        async ping() {
            try { return client.isReady && await client.ping() === 'PONG'; } catch { return false; }
        },
        async close() {
            await Promise.allSettled([subscriber?.quit(), client.quit()]);
        },
    };
}

/** The same in this process. Instances given the same backend share it like they would share a Redis. */
export function memoryBackend(): Backend {
    const rooms = new Map<string, { json: string; until: number }>();
    const seats = new Map<string, Map<string, number>>(), pods = new Map<string, { connections: number; until: number }>();
    const listeners: ((event: RoomEvent) => void)[] = [], total = noTotals(), claims = new Map<string, number>();
    const pending = new Map<string, HistoryWrite>(), capable = new Map<string, number>(), audience = new Map<string, number>();
    let serial = 0;
    function record(room: Room, previous: Room | null, ttl: number, history?: HistoryCapture) {
        if (!history) return;
        const id = `${Date.now()}-${++serial}`;
        pending.set(id, structuredClone({ id, room, previous, expires: Date.now() + ttl, capture: history.snapshot, completeAllowed: history.completeAllowed }));
    }
    let freeQueue: { json: string; until: number } | undefined;
    const live = (id: string) => {
        const kept = rooms.get(id);
        if (kept && kept.until <= Date.now()) rooms.delete(id);
        return rooms.get(id);
    };
    const performanceSamples: PlaySample[] = [];
    /** Another open socket of the same plaza member. */
    const same = (found: Map<string, number>, entry: string) => [...found.keys()].some(other => memberOfEntry(other) === memberOfEntry(entry));
    const members = (id: string, seat: Spot) => {
        const key = `${id}:${seat}`, now = Date.now();
        let found = seats.get(key);
        if (!found) seats.set(key, found = new Map());
        for (const [member, until] of Array.from(found)) if (until <= now) found.delete(member);
        return found;
    };
    return {
        kind: 'memory',
        async appendPerformance(samples) { performanceSamples.push(...structuredClone(samples)); if (performanceSamples.length > 2048) performanceSamples.splice(0, performanceSamples.length - 2048); },
        async readPerformance() { return structuredClone(performanceSamples.filter(sample => sample.at >= Date.now() - 86400000)); },
        async create(room, ttl, history) {
            if (live(room.id)) return false;
            record(room, null, ttl, history);
            rooms.set(room.id, { json: JSON.stringify(room), until: Date.now() + ttl });
            return true;
        },
        async get(id) {
            const kept = live(id);
            return kept ? JSON.parse(kept.json) as Room : null;
        },
        async ids() { return Array.from(rooms.keys()).filter(id => live(id)); },
        async replace(room, expected, ttl, history) {
            const kept = live(room.id);
            if (!kept || (JSON.parse(kept.json) as Room).version !== expected) return false;
            record(room, JSON.parse(kept.json) as Room, ttl, history);
            rooms.set(room.id, { json: JSON.stringify(room), until: Date.now() + ttl });
            return true;
        },
        async freeMatchQueue() {
            return freeQueue && freeQueue.until > Date.now() ? JSON.parse(freeQueue.json) as FreeMatchQueue : { version: 0, entries: {} };
        },
        async replaceFreeMatchQueue(queue, expected, room, roomTtl, history) {
            const current = freeQueue && freeQueue.until > Date.now() ? (JSON.parse(freeQueue.json) as FreeMatchQueue).version : 0;
            if (current !== expected || room && live(room.id)) return false;
            if (room) record(room, null, roomTtl ?? 1, history);
            if (room) rooms.set(room.id, { json: JSON.stringify(room), until: Date.now() + (roomTtl ?? 1) });
            freeQueue = { json: JSON.stringify(queue), until: Date.now() + 600_000 };
            return true;
        },
        async historyPending() { return structuredClone([...pending.values()].slice(0, 100)); },
        async historyAck(id) { pending.delete(id); },
        async historyCapable(pod, ttl) { capable.set(pod, Date.now() + ttl); },
        async audienceCapable(pod, ttl) { audience.set(pod, Date.now() + ttl); },
        async audienceReady() { return [...pods].every(([id, pod]) => pod.until <= Date.now() || (audience.get(id) ?? 0) > Date.now()); },
        async historyReady() { return [...pods].every(([id, pod]) => pod.until <= Date.now() || (capable.get(id) ?? 0) > Date.now()); },
        async publish(event) {
            const copy = JSON.stringify(event);
            for (const listener of listeners) listener(JSON.parse(copy) as RoomEvent);
        },
        async subscribe(listener) { listeners.push(listener); },
        async enter({ id, seat, member }, ttl) {
            const found = members(id, seat), first = seat === 'm' ? !same(found, member) : found.size === 0;
            found.set(member, Date.now() + ttl);
            return first;
        },
        async leave({ id, seat, member }) {
            const found = members(id, seat);
            found.delete(member);
            return seat === 'm' ? !same(found, member) : found.size === 0;
        },
        async online(id) { return [members(id, 0).size > 0, members(id, 1).size > 0]; },
        async presence(id) { return { online: [members(id, 0).size > 0, members(id, 1).size > 0], watching: members(id, 2).size, members: plazaMembers([...members(id, 'm').keys()]) }; },
        async claim(key, ttl) {
            if ((claims.get(key) ?? 0) > Date.now()) return false;
            claims.set(key, Date.now() + ttl);
            if (claims.size > 4096) for (const [old, until] of claims) if (until <= Date.now()) claims.delete(old);
            return true;
        },
        async watching(id) { return members(id, 2).size; },
        async refresh(entries, ttl) { for (const { id, seat, member } of entries) members(id, seat).set(member, Date.now() + ttl); },
        async count(name) { total[name]++; },
        async beat(pod, connections, ttl) { pods.set(pod, { connections, until: Date.now() + ttl }); },
        async forget(pod) { pods.delete(pod); },
        async overview() {
            const counts = noRooms(), now = Date.now();
            for (const id of Array.from(rooms.keys())) {
                const kept = live(id);
                if (kept) counts[(JSON.parse(kept.json) as Room).status]++;
            }
            const running = Array.from(pods.values()).filter(pod => pod.until > now);
            return { rooms: counts, total: { ...total }, pods: running.length, connections: running.reduce((sum, pod) => sum + pod.connections, 0) };
        },
        async ping() { return true; },
        async close() {},
    };
}
