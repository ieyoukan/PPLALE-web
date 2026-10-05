// Everything a room can do, on the room as the server keeps it (both decks and the full match).
// Nothing here knows about sockets or where rooms are kept: a request changes the room or throws RoomError.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { applyCommand, newGame, other, sandboxRules, viewFor } from '@pplale/game-core';
import type { Catalog, Deck, GameState, Side } from '@pplale/game-core';
import { MAX_NAME_LENGTH, parseRoomRules, roomDeckErrors } from '@pplale/game-core/room';
import type { LastCommand, RoomCommand, RoomInfo, RoomRules, RoomStatus, RoomView } from '@pplale/game-core/room';

export interface Seat {
    /** SHA-256 of the seat's secret; the secret itself is only in that player's browser. */
    tokenHash: string;
    name: string;
    deck: Deck | null;
    ready: boolean;
    /** Went away during or after a match; cleared by anything the seat does later. */
    left?: boolean;
}
export interface Room {
    id: string;
    version: number;
    status: RoomStatus;
    match: number;
    rules: RoomRules;
    seats: [Seat, Seat | null];
    state: GameState | null;
    last: LastCommand | null;
    resigned: Side | null;
}

/** A request that cannot be done; `status` is the HTTP status and `message` is shown to the player. */
export class RoomError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const side = z.union([z.literal(0), z.literal(1)]);
const uid = z.string().max(16);
// `actor` is replaced by the sender's seat, whatever was sent.
const command = z.discriminatedUnion('type', [
    z.object({ type: z.literal('roll'), actor: side }),
    z.object({ type: z.literal('initiative'), actor: side, order: z.enum(['first', 'second']) }),
    z.object({ type: z.literal('openingDraw'), actor: side, deck: z.enum(['yojo', 'sweet']) }),
    z.object({ type: z.literal('mulligan'), actor: side, uids: z.array(uid).max(10) }),
    z.object({ type: z.literal('keep'), actor: side }),
    z.object({ type: z.literal('play'), actor: side, uid, slot: z.number().int().min(0).max(6).optional() }),
    z.object({ type: z.literal('attack'), actor: side, uid, target: uid }),
    z.object({ type: z.literal('end'), actor: side }),
    z.object({ type: z.literal('choose'), actor: side, option: z.string().max(32) }),
    z.object({ type: z.literal('skill'), actor: side, index: z.number().int().min(0).max(8) }),
    z.object({ type: z.literal('reveal'), actor: side, uid }),
]);
const cardIds = z.array(z.string().max(16)).max(40);
const deck = z.object({ name: z.string().max(60), yojo: cardIds, sweet: cardIds, playable: z.string().max(16) });
const action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('ready'), deck }),
    z.object({ action: z.literal('unready') }),
    z.object({ action: z.literal('command'), command, revision: z.number().int() }),
    z.object({ action: z.literal('resign') }),
    z.object({ action: z.literal('rematch') }),
    z.object({ action: z.literal('leave') }),
]);

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/** A name as it is shown to the other player: short, one line, never empty. */
function playerName(value: unknown, fallback: string) {
    const name = typeof value === 'string' ? Array.from(value.replace(/\p{C}/gu, '').trim()).slice(0, MAX_NAME_LENGTH).join('') : '';
    return name || fallback;
}
function newSeat(name: string): { seat: Seat; token: string } {
    const token = randomBytes(32).toString('base64url');
    return { seat: { tokenHash: hash(token), name, deck: null, ready: false }, token };
}

/** The seat `token` belongs to, or null. */
export function seatOf(room: Room, token: unknown): Side | null {
    const given = Buffer.from(hash(typeof token === 'string' ? token : ''));
    const index = room.seats.findIndex(seat => seat && timingSafeEqual(Buffer.from(seat.tokenHash), given));
    return index < 0 ? null : index as Side;
}

/** Who is connected right now: each seat, and how many are watching. */
export interface Present { online: [boolean, boolean]; watching: number }

/** What `seat` is told about the room, or (`'spectator'`) what someone watching is. */
export function seatView(room: Room, seat: Side | 'spectator', { online, watching }: Present): RoomView {
    const { id, version, status, match, rules, last, resigned, seats, state } = room;
    const players = seats.map((s, index) => s && { name: s.name, ready: s.ready, online: online[index], ...(s.left && { left: true }), ...(index === seat && s.deck && { deck: s.deck.name }) }) as RoomView['players'];
    return {
        id, version, seat: seat === 'spectator' ? 0 : seat, ...(seat === 'spectator' && { watching: true as const }), spectators: watching,
        status, match, rules, players, game: state && viewFor(state, seat), last, resigned,
    };
}
export const roomInfo = (room: Room): RoomInfo =>
    ({ id: room.id, rules: room.rules, host: room.seats[0].name, open: room.status === 'lobby' && !room.seats[1], spectators: !!room.rules.spectators });

/** A new room with its host seated. `body`: `{ rules, name }` as sent. */
export function createRoom(id: string, body: unknown): { room: Room; token: string } {
    const input = body as { rules?: unknown; name?: unknown } | null;
    const rules = parseRoomRules(input?.rules);
    if (!rules) throw new RoomError(400, '使えるフルーツを1つ以上選んでください');
    const { seat, token } = newSeat(playerName(input?.name, 'ホスト'));
    return { room: { id, version: 1, status: 'lobby', match: 0, rules, seats: [seat, null], state: null, last: null, resigned: null }, token };
}

/** Seats a guest. `body`: `{ name }` as sent. Returns the guest's secret. */
export function joinRoom(room: Room, body: unknown): string {
    if (room.status === 'closed') throw new RoomError(410, 'このルームは解散しました');
    if (room.status !== 'lobby' || room.seats[1]) throw new RoomError(409, 'このルームは満員です');
    const { seat, token } = newSeat(playerName((body as { name?: unknown } | null)?.name, 'ゲスト'));
    room.seats[1] = seat;
    return token;
}

/** Random order of the list: card uids follow it, so they must not tell which card is which. */
function mixed(ids: string[]) {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function startMatch(room: Room, catalog: Catalog) {
    const decks = room.seats.map(seat => ({ ...seat!.deck!, name: seat!.name, yojo: mixed(seat!.deck!.yojo), sweet: mixed(seat!.deck!.sweet) })) as [Deck, Deck];
    room.state = newGame(decks, catalog, { ...sandboxRules }, randomInt(2 ** 32));
    room.status = 'playing';
    room.match++;
    room.resigned = null;
}
function giveUp(room: Room, seat: Side) {
    const state = room.state!;
    state.winner = other(seat);
    state.pending = null;
    state.queue = [];
    state.log.push(`${state.players[seat].name}が投了しました`);
    state.revision++;
    room.status = 'finished';
    room.resigned = seat;
}

/** What a request did besides changing the room, for the server's counters and sockets. */
export interface Outcome {
    started?: true;
    finished?: true;
    command?: true;
    /** The guest's seat was given up: its sockets have no room any more. */
    vacated?: true;
}

/** One request of `seat` (as sent). Changes the room or throws RoomError and leaves it as it was. */
export function act(room: Room, seat: Side, body: unknown, catalog: Catalog): Outcome {
    const parsed = action.safeParse(body);
    if (!parsed.success) throw new RoomError(400, 'リクエストの形式が正しくありません');
    const request = parsed.data, own = room.seats[seat]!;
    const outcome: Outcome = {};
    switch (request.action) {
        case 'ready': {
            if (room.status !== 'lobby') throw new RoomError(409, '対戦中はデッキを変えられません');
            const errors = roomDeckErrors(request.deck, room.rules, catalog);
            if (errors.length) throw new RoomError(400, errors.join(' / '));
            own.deck = request.deck;
            own.ready = true;
            if (room.seats.every(s => s?.ready)) {
                startMatch(room, catalog);
                outcome.started = true;
            }
            break;
        }
        case 'unready':
            if (room.status !== 'lobby') throw new RoomError(409, '対戦はもう始まっています');
            own.ready = false;
            break;
        case 'command': {
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            const state = room.state, sent = { ...request.command, actor: seat } as RoomCommand;
            // During the turns only one side acts, so a command made on an older view is a mistake.
            // The opening draws and the mulligan are done by both sides at once.
            if (state.phase === 'playing' && request.revision !== state.revision) throw new RoomError(409, '盤面が更新されました。もう一度操作してください');
            const cardId = sent.type === 'play' || sent.type === 'reveal' ? state.cards[sent.uid]?.cardId : undefined;
            const result = applyCommand(state, sent, catalog);
            if (result.error) throw new RoomError(422, result.error);
            room.state = result.state;
            room.last = { command: sent, ...(cardId && { cardId }) };
            outcome.command = true;
            if (result.state.winner !== null) {
                room.status = 'finished';
                outcome.finished = true;
            }
            break;
        }
        case 'resign':
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            giveUp(room, seat);
            outcome.finished = true;
            break;
        case 'rematch':
            if (room.status !== 'finished') throw new RoomError(409, '対戦が終わってから選べます');
            // Back to choosing decks; the next match starts when both are ready again.
            room.status = room.seats[0].left ? 'closed' : 'lobby';
            room.state = null;
            room.resigned = null;
            // A guest who left gives the seat to whoever comes next.
            if (room.seats[1]?.left) room.seats[1] = null;
            for (const s of room.seats) if (s) s.ready = false;
            break;
        case 'leave':
            if (room.status === 'playing' || room.status === 'finished') {
                if (room.status === 'playing') {
                    giveUp(room, seat);
                    outcome.finished = true;
                }
                own.left = true;
            } else if (room.status === 'lobby' && seat === 1) {
                room.seats[1] = null;
                outcome.vacated = true;
            } else if (room.status === 'lobby') room.status = 'closed';
            break;
    }
    if (request.action !== 'leave') own.left = false;
    // What the previous command showed belongs to the previous version only.
    if (!outcome.command) room.last = null;
    return outcome;
}
