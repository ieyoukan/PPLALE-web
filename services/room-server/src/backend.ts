// What every instance of the server shares, kept in Redis: the rooms, who is connected, the
// counters, and the channel on which an instance tells the others that a room changed. The
// instances themselves hold nothing but their sockets, so any of them can serve any room and one
// can be replaced without ending a match.
//
//   pplale:room:{id}        hash   json (the room), v (its version), st (its status); expires when idle
//   pplale:on:{id}:{spot}   zset   one member per open socket of a seat (0, 1) or of the spectators (2), scored with when it lapses
//   pplale:pod:{pod}        string that instance's socket count; lapses when the instance is gone
//   pplale:totals           hash   counters since the data began
//   pplale:rooms            channel
//
// Without Redis (development, tests) the same is kept in the process by `memoryBackend`.
import { createClient } from 'redis';
import type { Side } from '@pplale/game-core';
import type { RoomServerStats, RoomStatus } from '@pplale/game-core/room';
import type { Room } from './rooms.ts';

/** A room changed. Every instance sends the views to the sockets it holds. */
export interface RoomEvent {
    /** The instance that made the change (it has already told its own sockets). */
    from: string;
    room: Room;
    online: [boolean, boolean];
    watching: number;
    /** That seat was given up: its sockets have no room any more. */
    dismiss?: Side;
}
export type Totals = RoomServerStats['total'];
/** Where a socket is in a room: a seat, or (2) among the spectators. */
export type Spot = Side | 2;
export interface Member { id: string; seat: Spot; member: string }
export interface Overview { rooms: Record<RoomStatus, number>; total: Totals; pods: number; connections: number }

export interface Backend {
    readonly kind: RoomServerStats['backend'];
    /** False when the id is taken. `ttl` (ms): how long the room lasts without another change. */
    create(room: Room, ttl: number): Promise<boolean>;
    get(id: string): Promise<Room | null>;
    /** Stores the room if it is still at version `expected`; false when someone else changed it first. */
    replace(room: Room, expected: number, ttl: number): Promise<boolean>;
    publish(event: RoomEvent): Promise<void>;
    subscribe(listener: (event: RoomEvent) => void): Promise<void>;
    /** A socket of the seat opened. True when the seat had none (the player just came). */
    enter(entry: Member, ttl: number): Promise<boolean>;
    /** A socket of the seat closed. True when the seat has none left (the player is gone). */
    leave(entry: Member): Promise<boolean>;
    online(id: string): Promise<[boolean, boolean]>;
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
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'json', ARGV[3], 'st', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1`;

export async function redisBackend(url: string, prefix = 'pplale:'): Promise<Backend> {
    const client = createClient({ url });
    // Without a listener a dropped connection would end the process; the client connects again by itself.
    client.on('error', error => console.error('redis', error instanceof Error ? error.message : error));
    await client.connect();
    let subscriber: typeof client | undefined;
    const roomKey = (id: string) => `${prefix}room:${id}`, seatKey = (id: string, seat: Spot) => `${prefix}on:${id}:${seat}`;
    const channel = `${prefix}rooms`, totalsKey = `${prefix}totals`, podKey = (pod: string) => `${prefix}pod:${pod}`;
    const store = async (room: Room, expected: string, ttl: number) =>
        await client.eval(STORE, { keys: [roomKey(room.id)], arguments: [expected, String(room.version), JSON.stringify(room), room.status, String(Math.ceil(ttl))] }) === 1;
    /** Open sockets of a seat, after dropping the ones whose instance stopped refreshing them. */
    const present = async (id: string, seat: Spot) => {
        await client.zRemRangeByScore(seatKey(id, seat), '-inf', Date.now());
        return client.zCard(seatKey(id, seat));
    };
    const mark = (entry: Member, ttl: number) => Promise.all([
        client.zAdd(seatKey(entry.id, entry.seat), { score: Date.now() + ttl, value: entry.member }),
        client.pExpire(seatKey(entry.id, entry.seat), Math.ceil(ttl)),
    ]);
    async function keys(pattern: string) {
        const found: string[] = [];
        for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 500 })) found.push(...(Array.isArray(batch) ? batch : [batch]));
        return found;
    }
    return {
        kind: 'redis',
        create: (room, ttl) => store(room, '', ttl),
        async get(id) {
            const json = await client.hGet(roomKey(id), 'json');
            return json ? JSON.parse(json) as Room : null;
        },
        replace: (room, expected, ttl) => store(room, String(expected), ttl),
        async publish(event) { await client.publish(channel, JSON.stringify(event)); },
        async subscribe(listener) {
            subscriber = client.duplicate();
            subscriber.on('error', error => console.error('redis (subscriber)', error instanceof Error ? error.message : error));
            await subscriber.connect();
            await subscriber.subscribe(channel, message => listener(JSON.parse(message) as RoomEvent));
        },
        async enter(entry, ttl) {
            const before = await present(entry.id, entry.seat);
            await mark(entry, ttl);
            return before === 0;
        },
        async leave(entry) {
            await client.zRem(seatKey(entry.id, entry.seat), entry.member);
            return await present(entry.id, entry.seat) === 0;
        },
        async online(id) {
            const [a, b] = await Promise.all([present(id, 0), present(id, 1)]);
            return [a > 0, b > 0];
        },
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
    const listeners: ((event: RoomEvent) => void)[] = [], total = noTotals();
    const live = (id: string) => {
        const kept = rooms.get(id);
        if (kept && kept.until <= Date.now()) rooms.delete(id);
        return rooms.get(id);
    };
    const members = (id: string, seat: Spot) => {
        const key = `${id}:${seat}`, now = Date.now();
        let found = seats.get(key);
        if (!found) seats.set(key, found = new Map());
        for (const [member, until] of Array.from(found)) if (until <= now) found.delete(member);
        return found;
    };
    return {
        kind: 'memory',
        async create(room, ttl) {
            if (live(room.id)) return false;
            rooms.set(room.id, { json: JSON.stringify(room), until: Date.now() + ttl });
            return true;
        },
        async get(id) {
            const kept = live(id);
            return kept ? JSON.parse(kept.json) as Room : null;
        },
        async replace(room, expected, ttl) {
            const kept = live(room.id);
            if (!kept || (JSON.parse(kept.json) as Room).version !== expected) return false;
            rooms.set(room.id, { json: JSON.stringify(room), until: Date.now() + ttl });
            return true;
        },
        async publish(event) {
            const copy = JSON.stringify(event);
            for (const listener of listeners) listener(JSON.parse(copy) as RoomEvent);
        },
        async subscribe(listener) { listeners.push(listener); },
        async enter({ id, seat, member }, ttl) {
            const found = members(id, seat), first = found.size === 0;
            found.set(member, Date.now() + ttl);
            return first;
        },
        async leave({ id, seat, member }) {
            const found = members(id, seat);
            found.delete(member);
            return found.size === 0;
        },
        async online(id) { return [members(id, 0).size > 0, members(id, 1).size > 0]; },
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
