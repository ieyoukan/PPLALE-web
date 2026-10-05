// Matches between two players over a network (ルームマッチ): the rules a room is made with and
// what the browser and the room server (services/room-server) say to each other. The server keeps
// the match; a browser only ever gets its own seat's view of it (redact.ts).
import type { Catalog, Command, Deck, GameState, Side } from './model.ts';
import { validateDeck } from './setup.ts';

// ── The rules of a room: which cards its decks may use ──
export const fruits = ['strawberry', 'grape', 'melon', 'orange'] as const;
export type Fruit = typeof fruits[number];
export const fruitNames: Record<Fruit, string> = { strawberry: 'いちご', grape: 'ぶどう', melon: 'めろん', orange: 'おれんじ' };

export interface RoomRules {
    /** Fruits whose 幼女 and お菓子 may be in a deck. */
    fruits: Fruit[];
    /** Whether 拡張プレイアブル may lead a deck. */
    extendedPlayable: boolean;
}
export const defaultRoomRules: RoomRules = { fruits: ['strawberry'], extendedPlayable: false };
/**
 * What the engine can play today (see `validateDeck`). A room cannot allow more than this; add a
 * fruit here when its cards are implemented.
 */
export const playableNow: RoomRules = { fruits: ['strawberry'], extendedPlayable: false };

/** The usable part of anything sent as rules, or null when no fruit is left. */
export function parseRoomRules(value: unknown): RoomRules | null {
    const raw = value as Partial<RoomRules> | null | undefined;
    const chosen = Array.isArray(raw?.fruits) ? fruits.filter(fruit => raw.fruits!.includes(fruit) && playableNow.fruits.includes(fruit)) : [];
    return chosen.length ? { fruits: chosen, extendedPlayable: raw?.extendedPlayable === true && playableNow.extendedPlayable } : null;
}

const isExtended = (catalog: Catalog, id: string) => catalog[id]?.type === 'playable' && (catalog[id].version ?? 'normal') !== 'normal';

/** Why the deck cannot be used in a room with these rules (empty when it can). */
export function roomDeckErrors(deck: Deck, rules: RoomRules, catalog: Catalog): string[] {
    const errors: string[] = [];
    const used = new Set([...deck.yojo, ...deck.sweet].map(id => catalog[id]?.fruit).filter((fruit): fruit is Fruit => fruits.includes(fruit as Fruit)));
    for (const fruit of Array.from(used)) if (!rules.fruits.includes(fruit)) errors.push(`このルームでは${fruitNames[fruit]}のカードを使えません`);
    if (isExtended(catalog, deck.playable) && !rules.extendedPlayable) errors.push('このルームでは拡張プレイアブルを使えません');
    return errors.length ? errors : validateDeck(deck, catalog);
}

/** One line for the lobby and for sharing, e.g. 「フルーツ：いちご ／ 拡張プレイアブル：なし」. */
export const describeRoomRules = (rules: RoomRules) =>
    `フルーツ：${rules.fruits.map(fruit => fruitNames[fruit]).join('・')} ／ 拡張プレイアブル：${rules.extendedPlayable ? 'あり' : 'なし'}`;

// ── What a seat is told ──
/** lobby: choosing decks. playing / finished: a match. closed: the host left before a match. */
export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';

/** A command the other side may see: never a test command, and always from the sender's own seat. */
export type RoomCommand = Exclude<Command, { type: 'adjust' | 'draw' }>;

/** The command that led to `game`, so the other side can show it happening. */
export interface LastCommand {
    command: RoomCommand;
    /** The card a `play` / `reveal` showed, which the other side's previous view did not know. */
    cardId?: string;
}

/** A room as one seat sees it. `game` hides what that seat may not know (`viewFor`). */
export interface RoomView {
    id: string;
    /** Grows with every change of the room; an older view never replaces a newer one. */
    version: number;
    seat: Side;
    status: RoomStatus;
    /** Counts the matches played in this room; a new number means a new match. */
    match: number;
    rules: RoomRules;
    /** Index = seat. The second is null until someone joins. */
    players: [RoomPlayer, RoomPlayer | null];
    game: GameState | null;
    last: LastCommand | null;
    /** The seat that gave up the current match. */
    resigned: Side | null;
}
export interface RoomPlayer {
    name: string;
    ready: boolean;
    /** Connected to the server right now. */
    online: boolean;
    /** Left the room during or after a match. */
    left?: boolean;
    /** Only told to the seat itself. */
    deck?: string;
}

/** What someone without a seat may know (the page a shared link opens). */
export interface RoomInfo {
    id: string;
    rules: RoomRules;
    host: string;
    /** A seat is free and no match has started. */
    open: boolean;
}

/** A seat and the secret that acts for it (kept in that player's browser only). */
export interface SeatKey {
    seat: Side;
    token: string;
}
export interface Seated extends SeatKey {
    view: RoomView;
}

export type RoomAction =
    | { action: 'ready'; deck: Deck }
    | { action: 'unready' }
    | { action: 'command'; command: RoomCommand; revision: number }
    | { action: 'resign' }
    | { action: 'rematch' }
    | { action: 'leave' };

// ── The socket of a seat (`/rooms/{id}/socket`) ──
/** `hello` comes first and names the seat. `n` numbers an action so its `result` can be told apart. */
export type ClientMessage =
    | { type: 'hello'; token: string }
    | { type: 'action'; n: number; action: RoomAction };
/**
 * `view`: the seat's view, now and after every change. `result`: what became of action `n`
 * (`error` when it was refused; its view was already sent). `gone`: no such room or seat (any more).
 */
export type ServerMessage =
    | { type: 'view'; view: RoomView }
    | { type: 'result'; n: number; error?: string }
    | { type: 'gone'; error: string };

/** How the room server is doing (`GET /stats`): shown on the バトル tab and useful when something is off. */
export interface RoomServerStats {
    /** Of the instance that answered. */
    version: string;
    /** Seconds since that instance started. */
    uptime: number;
    /** Where the rooms are kept: `redis`, or `memory` (one instance without Redis; development). */
    backend: 'redis' | 'memory';
    /** Instances running now. */
    pods: number;
    /** Rooms by what they are doing now. */
    rooms: Record<RoomStatus, number>;
    /** Open sockets on all instances (about the players looking at a room now). */
    connections: number;
    /** Since the data began (they outlast the instances). */
    total: { roomsCreated: number; matchesStarted: number; matchesFinished: number; commands: number };
}

export const ROOM_ID_LENGTH = 6;
export const isRoomId = (value: unknown): value is string => typeof value === 'string' && /^\d{6}$/.test(value);
export const MAX_NAME_LENGTH = 12;
