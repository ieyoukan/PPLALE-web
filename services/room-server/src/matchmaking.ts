// A shared, short-lived queue. Polling refreshes a player's place; pairing creates the room in
// the same compare-and-set as both tickets, even when requests arrive on different instances.
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Catalog, Deck, Side } from '@pplale/game-core';
import { ROOM_ID_LENGTH, freeMatchRules, roomDeckErrors } from '@pplale/game-core/room';
import type { FreeMatchStatus } from '@pplale/game-core/room';
import type { Backend } from './backend.ts';
import { act, createRoom, joinRoom, RoomError } from './rooms.ts';
import type { Room } from './rooms.ts';

const WAIT_TTL = 30_000;
const RESULT_TTL = 10 * 60_000;
type Entry = { until: number } & (
    | { status: 'waiting'; since: number; name: string; deck: Deck; historyOwners?: string[] }
    | { status: 'cancelled' }
    | { status: 'matched'; roomId: string; seat: Side }
);
export interface FreeMatchQueue { version: number; entries: Record<string, Entry> }

const tokenSchema = z.string().regex(/^[\da-f]{64}$/);
const cards = z.array(z.string().max(16)).max(40);
const startSchema = z.object({
    token: tokenSchema,
    name: z.string().max(100),
    deck: z.object({ name: z.string().max(60), yojo: cards, sweet: cards, playable: z.string().max(16) }),
});

export async function freeMatch(backend: Backend, catalog: Catalog, operation: 'start' | 'status' | 'cancel', body: unknown,
    options: { maxRooms: number; roomTtl: number; mayStart: () => boolean; allowSpectators?: boolean; owners?: string[] }): Promise<{ status: FreeMatchStatus; created?: Room }> {
    const input = z.object({ token: tokenSchema }).safeParse(body);
    if (!input.success) throw new RoomError(400, 'リクエストの形式が正しくありません');
    const id = createHash('sha256').update(input.data.token).digest('hex');
    const start = operation === 'start' ? startSchema.safeParse(body) : null;
    if (start && !start.success) throw new RoomError(400, 'デッキと名前を選んでください');
    if (start?.success) {
        const errors = roomDeckErrors(start.data.deck, freeMatchRules, catalog);
        if (errors.length) throw new RoomError(400, errors.join(' / '));
    }
    let admitted = false;
    for (let attempt = 0; attempt < 12; attempt++) {
        const queue = await backend.freeMatchQueue(), now = Date.now();
        for (const [key, entry] of Object.entries(queue.entries)) if (entry.until <= now) delete queue.entries[key];
        let own = queue.entries[id];
        if (own?.status === 'matched') {
            if (!await backend.get(own.roomId)) throw new RoomError(410, '対戦が見つかりません。もう一度相手を探してください');
            return { status: { status: 'matched', roomId: own.roomId, key: { seat: own.seat, token: input.data.token } } };
        }
        let created: Room | undefined;
        let status: FreeMatchStatus;
        if (operation === 'cancel') {
            if (!own && !admitted) {
                if (!options.mayStart()) throw new RoomError(429, '操作が多すぎます。しばらく待ってからお試しください');
                admitted = true;
            }
            if (!own && Object.keys(queue.entries).length >= options.maxRooms * 4) throw new RoomError(503, '混み合っています。少し待ってからお試しください');
            // Keep a tombstone so a delayed start request cannot put the player back in the queue.
            queue.entries[id] = { status: 'cancelled', until: now + WAIT_TTL };
            status = { status: 'cancelled' };
        } else {
            if (own?.status === 'cancelled') return { status: { status: 'cancelled' } };
            if (!own) {
                if (!start?.success) throw new RoomError(410, '相手の検索が終了しました。もう一度探してください');
                if (!admitted) {
                    if (!options.mayStart()) throw new RoomError(429, '操作が多すぎます。しばらく待ってからお試しください');
                    admitted = true;
                }
                if (Object.keys(queue.entries).length >= options.maxRooms * 4) throw new RoomError(503, '混み合っています。少し待ってからお試しください');
                own = { status: 'waiting', since: now, until: now + WAIT_TTL, name: start.data.name, deck: start.data.deck, ...(options.owners?.length && { historyOwners: options.owners }) };
                queue.entries[id] = own;
            }
            own.until = now + WAIT_TTL;
            const opponent = Object.entries(queue.entries)
                .filter((entry): entry is [string, Extract<Entry, { status: 'waiting' }>] => entry[0] !== id && entry[1].status === 'waiting')
                .sort((a, b) => a[1].since - b[1].since)[0];
            status = { status: 'waiting' };
            if (opponent) {
                const { rooms } = await backend.overview();
                if (Object.values(rooms).reduce((sum, count) => sum + count, 0) >= options.maxRooms) throw new RoomError(503, 'いまは対戦がいっぱいです。少し待ってからお試しください');
                const roomId = String(randomInt(10 ** ROOM_ID_LENGTH)).padStart(ROOM_ID_LENGTH, '0');
                const made = createRoom(roomId, { rules: { ...freeMatchRules, spectators: options.allowSpectators ?? true }, name: opponent[1].name });
                joinRoom(made.room, { name: own.name });
                made.room.mode = 'free';
                made.room.seats[0].historyOwners = opponent[1].historyOwners;
                made.room.seats[1]!.historyOwners = own.historyOwners;
                for (const seat of made.room.seats) if (seat) seat.profileId = seat.historyOwners?.find(owner => owner.startsWith('user:'))?.slice(5);
                // Each player's search secret also authenticates their seat. Only its hash is
                // kept in Redis; either player can recover the seat by polling with that secret.
                made.room.seats[0].tokenHash = opponent[0];
                made.room.seats[1]!.tokenHash = id;
                act(made.room, 0, { action: 'ready', deck: opponent[1].deck }, catalog);
                act(made.room, 1, { action: 'ready', deck: own.deck }, catalog);
                created = made.room;
                queue.entries[opponent[0]] = { status: 'matched', roomId, seat: 0, until: now + RESULT_TTL };
                queue.entries[id] = { status: 'matched', roomId, seat: 1, until: now + RESULT_TTL };
                status = { status: 'matched', roomId, key: { seat: 1, token: input.data.token } };
            }
        }
        const expected = queue.version++;
        if (await backend.replaceFreeMatchQueue(queue, expected, created, options.roomTtl)) return { status, created };
    }
    throw new RoomError(503, '混み合っています。もう一度お試しください');
}
