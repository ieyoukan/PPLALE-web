// Matches between two players over a network (ルームマッチ): the rules a room is made with and
// what the browser and the room server (services/room-server) say to each other. The server keeps
// the match; a browser only ever gets its own seat's view of it (redact.ts).
import type { Catalog, Command, Deck, GameState, Side } from './model.ts';
import type { CpuLevel } from './ai/types.ts';
import { defaultMatchRules, deckRuleErrors, describeMatchRules, parseMatchRules } from './rules.ts';
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
/** lobby: choosing decks (in a plaza: no match on the table). playing / finished: a match. closed: the room is gone (its host left, or everyone did). */
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
    /** The server takes `away` messages (older servers close a socket that sends one). */
    reportsAway?: true;
    /** People watching right now. */
    spectators: number;
    /** Available after the match is durably saved. */
    replayId?: string;
    /** The same public-position estimate for players and spectators; excludes unrevealed hands. */
    assessment?: { win: number; method: 'public-position-value-v1' };
    status: RoomStatus;
    /** Counts the matches played in this room; a new number means a new match. */
    match: number;
    /** Stable identity for the current match, including reconnects and room-id reuse. */
    matchId?: string;
    rules: RoomRules;
    /** Index = seat. Null: nobody sits there (in a two-seat room only the second, until someone joins). */
    players: [RoomPlayer | null, RoomPlayer | null];
    /** The room as a place people gather in (rooms made by the game's launcher); absent for free matches and older rooms. */
    plaza?: PlazaView;
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
    /** Own deck name, or the CPU’s selected deck name (never its hidden cards). */
    deck?: string;
    /** In a plaza: the member who sits here. */
    member?: string;
    /** The server plays this seat. */
    cpu?: CpuLevel;
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
    /** A plaza, as far as the asker may know it (only asked about when they may enter it). */
    plaza?: PlazaInfo;
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
    /** In a plaza: keep the seat for the next match (two-seat rooms: back to choosing decks together). */
    | { action: 'rematch' }
    /** Gives up the room (a match in progress is lost). */
    | { action: 'leave' }
    // ── A plaza only ──
    | { action: 'sit'; seat: Side }
    /** Frees the own seat and stays in the room (a match in progress is lost). */
    | { action: 'stand' }
    /** Calls or configures the CPU before a match. Without a deck the server makes one. */
    | { action: 'cpu'; seat: Side; level: CpuLevel; deck?: Deck }
    | { action: 'dismissCpu' }
    /** Becomes the owner of a room that has none. */
    | { action: 'claim' }
    /** The owner sets the rules of the next match. */
    | { action: 'rules'; rules: RoomRules }
    /** The owner changes the room's displayed name; its creator and visibility stay fixed. */
    | { action: 'rename'; name: string }
    /** Plain text to the people in this plaza. The client id makes retries idempotent. */
    | { action: 'chat'; text: string; messageId: string }
    /** A new invitation link; the previous one stops working. */
    | { action: 'renewInvite' }
    /** Answers a friend who asked to be let in. */
    | { action: 'answer'; profileId: string; accept: boolean };

// ── A plaza: a room people gather in, with one table of two seats ──
/**
 * Who may come in, chosen when the room is made and never changed:
 * public: anyone. friends: friends of its creator. friendsPlus: friends of its creator or of anyone in it.
 * invite: those its owner invites (a shared invitation link counts). invitePlus: those anyone in it invites.
 */
export type RoomVisibility = 'public' | 'friends' | 'friendsPlus' | 'invite' | 'invitePlus';
export const roomVisibilities: readonly RoomVisibility[] = ['public', 'friends', 'friendsPlus', 'invite', 'invitePlus'];
/** What a new room uses until the player chooses otherwise. */
export const DEFAULT_VISIBILITY: RoomVisibility = 'invite';
/** The answer to entering a two-seat room as a room to gather in: nobody is seated; its lobby lets the visitor choose. */
export const TWO_SEAT_ROOM = 'このルームは2人用です';
export const isRoomVisibility = (value: unknown): value is RoomVisibility => roomVisibilities.includes(value as RoomVisibility);
/** Rooms friends can find (and see their friends in); the others are only reached by an invitation. */
export const listedVisibility = (visibility: RoomVisibility) => visibility === 'public' || visibility === 'friends' || visibility === 'friendsPlus';
export const invitedVisibility = (visibility: RoomVisibility) => visibility === 'invite' || visibility === 'invitePlus';
export const MAX_ROOM_NAME_LENGTH = 16;
/** People in one room at once, seated or not. */
export const MAX_MEMBERS = 16;
export const MAX_ROOM_CHAT_LENGTH = 300;
export const MAX_ROOM_CHAT_MESSAGES = 50;
export interface RoomChatMessage {
    id: string;
    member: string;
    name: string;
    profileId?: string;
    text: string;
    sentAt: number;
}
/** A member whose last connection closed this long ago is no longer in the room (ms). */
export const MEMBER_GRACE = 120_000;

/** Someone in a plaza: seated, waiting or watching. */
export interface PlazaMember {
    id: string;
    name: string;
    profileId?: string;
    /** Connected right now (a member away for a moment stays in the room for MEMBER_GRACE). */
    online: boolean;
    seat?: Side;
}
/** What a member is told about the plaza besides the table. */
export interface PlazaView {
    name: string;
    visibility: RoomVisibility;
    /** Who made the room; never changes, even after they left. */
    creator: { name: string; profileId?: string };
    /** The member who may change the rules now; null while nobody is (anyone in the room may become it). */
    owner: string | null;
    /** The member this view is for. */
    me: string;
    members: PlazaMember[];
    /** Present on servers supporting chat. Retained only in this room, outside match recordings. */
    chat?: RoomChatMessage[];
    chatEnabled?: true;
    /** The rules of the next match, when the owner changed them during this one. */
    nextRules?: RoomRules;
    /** The secret of the invitation link, only for those who may share it. */
    invite?: string;
    /** Signed-in friends asking to be let in, only for those who may let them. */
    requests?: { profileId: string; name: string }[];
}
/** What someone who may enter a plaza is told before entering it. */
export interface PlazaInfo {
    name: string;
    visibility: RoomVisibility;
    creator: { name: string; profileId?: string };
    /** People in the room, seated or not. */
    members: number;
    /** Seats taken (by people or the CPU). */
    seated: number;
}
/** A plaza to make: its initial name and fixed visibility, and (after a closed room) the room it takes over from. */
export interface PlazaRequest {
    name: string;
    visibility: RoomVisibility;
    /** The member token of a closed room this browser was in: its successor is entered instead of making another. */
    from?: { id: string; token: string };
}
/** The answer to making or entering a plaza: the member's secret and their first view. */
export interface Entered {
    token: string;
    view: RoomView;
}

// ── The socket of a seat (`/rooms/{id}/socket`) ──
/**
 * `hello` comes first: with the seat's token, or `watch` to look on without a seat.
 * `n` numbers an action so its `result` can be told apart.
 */
export type ClientMessage =
    /** `token`: a seat's, or a plaza member's. */
    | { type: 'hello'; token?: string; watch?: true; chat?: true }
    | { type: 'action'; n: number; action: RoomAction }
    | { type: 'performance'; reports: PlayReport[] }
    /** The seat's page was hidden (another app, screen off) or shown again: while hidden, the player is told of their turn by a push notification. Only sent when the view has `reportsAway`. */
    | { type: 'away'; away: boolean };
/**
 * `view`: the seat's view, now and after every change. `result`: what became of action `n`
 * (`error` when it was refused; its view was already sent). `gone`: no such room or seat (any more).
 */
export type ServerMessage =
    | { type: 'view'; view: RoomView }
    | { type: 'chat'; id: string; version: number; messages: RoomChatMessage[] }
    | { type: 'result'; n: number; error?: string; revision?: number; timing?: ServerTiming }
    /** `closed`: a plaza closed while this member was away; they may make its successor (`PlazaRequest.from`). */
    | { type: 'gone'; error: string; closed?: true };

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

/** A profile's current location, shared only with the player and accepted friends. Private rooms expose no identity. */
export type ProfileLocation = { kind: 'offline' } | { kind: 'private'; visibility: RoomVisibility } | { kind: 'room'; room: RoomInfo };
