// Matches between two players over a network (ルームマッチ): the rules a room is made with and
// what the browser and the room server (services/room-server) say to each other. The server keeps
// the match; a browser only ever gets its own seat's view of it (redact.ts).
import type { Catalog, Command, Deck, GameState, Side } from './model.ts';
import { defaultMatchRules, deckRuleErrors, describeMatchRules, parseMatchRules, playableNow } from './rules.ts';
import type { MatchRules } from './rules.ts';
import type { PlayPerformance, PlayReport, ServerTiming } from './performance.ts';

// ── The rules of a room: which cards its decks may use (rules.ts), and whether others may watch ──
export { describeMatchRules, fruitNames, fruits, playableNow } from './rules.ts';
export type { Fruit, MatchRules } from './rules.ts';

export interface RoomRules extends MatchRules {
    /** Per turn, in seconds. Omitted means unlimited; opening preparation is not timed. */
    turnSeconds?: 120 | 180 | 300;
    /**
     * Whether others may watch. In a room match a spectator sees both hands, so it trusts
     * its players not to watch their own match; both players are told, and how many are watching.
     */
    spectators?: boolean;
}
export const defaultRoomRules: RoomRules = { ...defaultMatchRules, spectators: false };
/** One public queue; live spectators cannot expose either unrevealed hand. */
export const freeMatchRules: RoomRules = { ...playableNow, spectators: true };

export type FreeMatchStatus =
    | { status: 'waiting' }
    | { status: 'cancelled' }
    | { status: 'matched'; roomId: string; key: SeatKey };

/** Only public names/icons and room ids; never decks, tokens, queue keys or history owners. */
export interface FreeMatchActivity {
    waiting: { name: string; playable: string; profileId?: string }[];
    matches: { id: string; players: [{ name: string; playable: string; profileId?: string }, { name: string; playable: string; profileId?: string }]; startedAt: number; turn: number; watching: number; status: 'playing' | 'finished'; replayId?: string }[];
}

/** The usable part of anything sent as rules, or null when no fruit is left. */
export function parseRoomRules(value: unknown): RoomRules | null {
    const rules = parseMatchRules(value);
    const seconds = (value as RoomRules | null)?.turnSeconds;
    return rules && { ...rules, spectators: (value as RoomRules).spectators === true,
        ...((seconds === 120 || seconds === 180 || seconds === 300) && { turnSeconds: seconds }) };
}

/** Why the deck cannot be used in a room with these rules (empty when it can). */
export const roomDeckErrors = (deck: Deck, rules: RoomRules, catalog: Catalog): string[] => deckRuleErrors(deck, rules, catalog, 'このルーム');

/** One line for the lobby and for sharing, e.g. 「フルーツ：いちご ／ 拡張プレイアブル：なし ／ 観戦：なし」. */
export const describeRoomRules = (rules: RoomRules) => `${describeMatchRules(rules)} ／ 観戦：${rules.spectators ? 'あり' : 'なし'} ／ 1ターン：${rules.turnSeconds ? `${rules.turnSeconds / 60}分` : '無制限'}`;

/** The server's clock. During the opponent's choices the deadline is null and remainingMs is frozen. */
export interface RoomTurnClock {
    turn: number;
    side: Side;
    remainingMs: number;
    deadline: number | null;
    /** Used to write the time-expiry notice only once per turn. */
    expired?: true;
}

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

/** A room as one seat (or a spectator) sees it. `game` hides what they may not know (`viewFor`). */
export interface RoomView {
    turnClock?: RoomTurnClock;
    /** Sampled when this view is sent, so countdowns do not depend on the browser's wall clock. */
    serverNow?: number;
    id: string;
    mode?: 'free';
    /** Grows with every change of the room; an older view never replaces a newer one. */
    version: number;
    /** The seat this view is for. A spectator's is 0: the side shown near. */
    seat: Side;
    /** Set on a spectator's view: nothing can be done with it. Free matches hide both hands. */
    watching?: true;
    /** People watching right now. */
    spectators: number;
    /** Available after the match is durably saved. */
    replayId?: string;
    assessment?: { win: number; method: 'public-position-value-v1' };
    status: RoomStatus;
    /** Counts the matches played in this room; a new number means a new match. */
    match: number;
    rules: RoomRules;
    /** Index = seat. The second is null until someone joins. */
    players: [RoomPlayer, RoomPlayer | null];
    /** Original deck list, only sent to its owner; never includes shuffle order. */
    ownDeck?: Deck;
    game: GameState | null;
    last: LastCommand | null;
    /** The seat that gave up the current match. */
    resigned: Side | null;
}
export interface RoomPlayer {
    name: string;
    profileId?: string;
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
    hostProfileId?: string;
    hostOnline?: boolean;
    status?: RoomStatus;
    /** A seat is free and no match has started. */
    open: boolean;
    /** The room may be watched. */
    spectators: boolean;
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
/**
 * `hello` comes first: with the seat's token, or `watch` to look on without a seat.
 * `n` numbers an action so its `result` can be told apart.
 */
export type ClientMessage =
    | { type: 'hello'; token?: string; watch?: true }
    | { type: 'action'; n: number; action: RoomAction }
    | { type: 'performance'; reports: PlayReport[] };
/**
 * `view`: the seat's view, now and after every change. `result`: what became of action `n`
 * (`error` when it was refused; its view was already sent). `gone`: no such room or seat (any more).
 */
export type ServerMessage =
    | { type: 'view'; view: RoomView }
    | { type: 'result'; n: number; error?: string; revision?: number; timing?: ServerTiming }
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
    /** Last 256 successful commands on this pod; not a network round-trip measurement. */
    latency?: RoomLatency;
    performance?: PlayPerformance;
}

export interface RoomLatency {
    count: number;
    samples: number;
    milliseconds: Record<'queue' | 'read' | 'apply' | 'store' | 'presence' | 'deliver' | 'publish' | 'total', { p50: number; p95: number; max: number }>;
}

export const ROOM_ID_LENGTH = 6;
export const isRoomId = (value: unknown): value is string => typeof value === 'string' && /^\d{6}$/.test(value);
export const MAX_NAME_LENGTH = 12;
