// A plaza: a room people gather in. The game's launcher makes one for every player, and a shared
// link brings friends into it. Its members come and go; its two seats are taken and given up by them
// (or by the CPU); one match at a time is played at its table and everyone else in the room watches.
// Who may come in is fixed when it is made; the owner may rename it. When nobody is left it closes.
// Like rooms.ts nothing here knows about sockets: a request changes the room or throws RoomError.
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { actingSides, cpuLevels, cpuProfiles, randomDeck, viewFor } from '@pplale/game-core';
import type { Catalog, CpuLevel, Deck, Side } from '@pplale/game-core';
import { DEFAULT_VISIBILITY, MAX_MEMBERS, MAX_ROOM_NAME_LENGTH, MAX_ROOM_CHAT_LENGTH, MAX_ROOM_CHAT_MESSAGES, MEMBER_GRACE, invitedVisibility, isRoomVisibility, parseRoomRules, roomDeckErrors } from '@pplale/game-core/room';
import type { RoomChatMessage } from '@pplale/game-core/room';
import type { RoomInfo, RoomRules, RoomView, RoomVisibility } from '@pplale/game-core/room';
import type { MatchEnd } from '@pplale/game-core/history';
import { publicAssessment } from './public-assessment.ts';
import { RoomError, applyMatchCommand, command, deck, giveUp, hash, playerName, side, startMatch } from './rooms.ts';
import type { Outcome, Room, Seat } from './rooms.ts';
import { syncTurnClock, turnTimeoutCommand } from './turn-clock.ts';

export interface PlazaMember {
    id: string;
    /** SHA-256 of the member's secrets, one per browser that entered as them (newest last). */
    tokens: string[];
    name: string;
    /** Public profile id, populated only from verified authentication. */
    profileId?: string;
    /** Verified account and/or hashed device owner; never exposed in a view. */
    historyOwners?: string[];
    lastChatAt?: number;
    /** Since when (ms) none of the member's sockets is open; absent while one is. */
    away?: number;
}
export interface Plaza {
    /** Tells this room from another one made later under the same id. */
    key: string;
    name: string;
    visibility: RoomVisibility;
    /** Who made the room, as they were then. Never changes. */
    creator: { name: string; profileId?: string };
    /** The member who may change the rules; null while nobody is. */
    owner: string | null;
    /** A disconnected owner's proof; cleared on an explicit leave or the next ownership claim. */
    formerOwner?: { tokens: string[]; profileId?: string };
    members: PlazaMember[];
    chat?: RoomChatMessage[];
    /** The secret of the invitation link (invite and invitePlus). Renewing it ends the old link. */
    invite?: string;
    /** Signed-in people let in by name: invited friends, and requests that were accepted. */
    allowed: string[];
    /** Signed-in friends of a member asking to be let in. */
    requests: { profileId: string; name: string; at: number }[];
    /** The rules of the next match, set while one is on. */
    nextRules?: RoomRules;
    /** The closed room this one took over from, and the one that took over after this one closed. */
    predecessor?: string;
    successor?: string;
    /** Secrets (hashed) of members whose moment away ran out: they may come back in, or make the successor. */
    former?: string[];
}

/** Who is asking: their verified profile id (if signed in), history owners and shown name. */
export interface Visitor { profileId?: string; historyOwners?: string[]; name: string }

/** What a plaza request did besides changing the room. */
export interface PlazaOutcome extends Outcome {
    chat?: true;
    /** Members no longer in the room: their sockets have no room any more. */
    removed?: string[];
    /** Someone was let in by name: they are told. */
    invited?: string;
    /** The room closed (nobody is left). */
    closed?: true;
    /** Nobody is left, but a match just ended in this change: it is recorded first, then `closeEmpty` closes the room. */
    emptied?: true;
}

const MAX_REQUESTS = 8, MAX_ALLOWED = 64, MAX_TOKENS = 4, MAX_FORMER = 64;
const secret = () => randomBytes(24).toString('base64url');
const level = z.enum(cpuLevels as [CpuLevel, ...CpuLevel[]]);
const profileId = z.string().regex(/^[\w-]{1,128}$/);
const action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('ready'), deck }),
    z.object({ action: z.literal('unready') }),
    z.object({ action: z.literal('command'), command, revision: z.number().int() }),
    z.object({ action: z.literal('resign') }),
    z.object({ action: z.literal('rematch') }),
    z.object({ action: z.literal('leave') }),
    z.object({ action: z.literal('sit'), seat: side }),
    z.object({ action: z.literal('stand') }),
    z.object({ action: z.literal('cpu'), seat: side, level, deck: deck.optional() }),
    z.object({ action: z.literal('dismissCpu') }),
    z.object({ action: z.literal('claim') }),
    z.object({ action: z.literal('rules'), rules: z.unknown() }),
    z.object({ action: z.literal('rename'), name: z.string() }),
    z.object({ action: z.literal('chat'), text: z.string().max(MAX_ROOM_CHAT_LENGTH * 2), messageId: z.string().uuid() }),
    z.object({ action: z.literal('renewInvite') }),
    z.object({ action: z.literal('answer'), profileId, accept: z.boolean() }),
]);

/** A room's name as it is shown: short, one line, never empty. */
export const roomName = (value: unknown, fallback: string) => playerName(value, fallback, MAX_ROOM_NAME_LENGTH);

function newMember(visitor: Visitor, now: number): { member: PlazaMember; token: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, member: {
        id: randomUUID().slice(0, 8), tokens: [hash(token)], name: visitor.name,
        ...(visitor.profileId && { profileId: visitor.profileId }), ...(visitor.historyOwners?.length && { historyOwners: visitor.historyOwners }),
        // Not connected yet: the time to open the room counts like a moment away.
        away: now,
    } };
}

/**
 * A new plaza with its creator in it (not seated) as its owner. `body`: `{ rules, plaza: { name, visibility } }` as sent.
 * Without a usable visibility (or a guest's friends' room) it is an invited room, never a public one by mistake.
 */
export function createPlaza(id: string, body: unknown, visitor: Visitor, now = Date.now()): { room: Room; token: string } {
    const input = body as { rules?: unknown; plaza?: { name?: unknown; visibility?: unknown } } | null;
    const rules = parseRoomRules(input?.rules);
    if (!rules) throw new RoomError(400, '使えるフルーツを1つ以上選んでください');
    const asked = isRoomVisibility(input?.plaza?.visibility) ? input.plaza.visibility : DEFAULT_VISIBILITY;
    // A guest has no friends: their friends' room would let nobody in, so it is an invited one instead (never public).
    const visibility = !visitor.profileId && (asked === 'friends' || asked === 'friendsPlus') ? DEFAULT_VISIBILITY : asked;
    const { member, token } = newMember(visitor, now);
    const plaza: Plaza = {
        key: randomUUID(), name: roomName(input?.plaza?.name, `${visitor.name}のルーム`), visibility,
        creator: { name: visitor.name, ...(visitor.profileId && { profileId: visitor.profileId }) },
        owner: member.id, members: [member], allowed: [], requests: [],
        ...(invitedVisibility(visibility) && { invite: secret() }),
    };
    return { room: { id, version: 1, status: 'lobby', match: 0, rules: { ...rules, spectators: true }, seats: [null, null], state: null, last: null, resigned: null, plaza }, token };
}

/** The member `token` belongs to, or null. */
export function memberOf(room: Room, token: unknown): PlazaMember | null {
    if (typeof token !== 'string' || !room.plaza) return null;
    const given = Buffer.from(hash(token));
    return room.plaza.members.find(member => member.tokens.some(saved => saved.length === given.length && timingSafeEqual(Buffer.from(saved), given))) ?? null;
}

/** Whether `token` was a member's who was away too long (not one who left on purpose). */
export function formerOf(room: Room, token: unknown): boolean {
    if (typeof token !== 'string' || !room.plaza?.former) return false;
    const given = Buffer.from(hash(token));
    return room.plaza.former.some(saved => saved.length === given.length && timingSafeEqual(Buffer.from(saved), given));
}

/** A room secret identifies its existing member only while the verified account still matches. */
export function rejoiningMember(room: Room, visitor: Visitor, token: unknown): PlazaMember | null {
    const member = memberOf(room, token);
    return member && member.profileId === visitor.profileId ? member : null;
}

/** Guests can take an unowned room when no signed-in participant is currently present. */
function mayClaim(plaza: Plaza, member: PlazaMember, online?: ReadonlySet<string>) {
    return !!member.profileId || !plaza.members.some(other => other.profileId && (online ? online.has(other.id) : other.away === undefined));
}

function restoreOwner(plaza: Plaza, member: PlazaMember, visitor: Visitor, rejoin: unknown) {
    const previous = plaza.formerOwner;
    if (plaza.owner !== null || !previous || previous.profileId !== visitor.profileId || typeof rejoin !== 'string') return;
    const given = Buffer.from(hash(rejoin));
    if (previous.tokens.some(saved => saved.length === given.length && timingSafeEqual(Buffer.from(saved), given))) {
        plaza.owner = member.id;
        delete plaza.formerOwner;
    }
}

const sameSecret = (saved: string | undefined, given: unknown) =>
    !!saved && typeof given === 'string' && given.length === saved.length && timingSafeEqual(Buffer.from(saved), Buffer.from(given));

/**
 * Whether `visitor` may come in: yes, no, or only as a friend of one of `friendsOf` (the server asks
 * Firestore). `invite`: the secret of the link they came by, if any.
 */
export function entryOf(room: Room, visitor: Pick<Visitor, 'profileId'>, invite: unknown): 'yes' | 'no' | { friendsOf: string[] } {
    const plaza = room.plaza!, uid = visitor.profileId;
    // Being let in by name only opens invited rooms: a friends' room stays its creator's (and members') friends'.
    if (uid && (plaza.creator.profileId === uid || plaza.members.some(member => member.profileId === uid) || invitedVisibility(plaza.visibility) && plaza.allowed.includes(uid))) return 'yes';
    switch (plaza.visibility) {
        case 'public': return 'yes';
        case 'friends': return uid && plaza.creator.profileId ? { friendsOf: [plaza.creator.profileId] } : 'no';
        case 'friendsPlus': {
            const people = [...new Set([plaza.creator.profileId, ...plaza.members.map(member => member.profileId)].filter((id): id is string => !!id))];
            return uid && people.length ? { friendsOf: people } : 'no';
        }
        default: return sameSecret(plaza.invite, invite) ? 'yes' : 'no';
    }
}

/**
 * Brings `visitor` into the room (they may come in: see `entryOf`). A signed-in person who is in it
 * already (another device) stays one member with one more secret. Returns their secret.
 */
export function admit(room: Room, visitor: Visitor, now = Date.now(), rejoin?: unknown): { token: string; member: PlazaMember } {
    const plaza = room.plaza!;
    if (room.status === 'closed') throw new RoomError(410, 'このルームは閉じました');
    const same = rejoiningMember(room, visitor, rejoin) ?? (visitor.profileId ? plaza.members.find(member => member.profileId === visitor.profileId) : undefined);
    if (same) {
        const token = randomBytes(32).toString('base64url');
        same.tokens = [...same.tokens, hash(token)].slice(-MAX_TOKENS);
        same.name = visitor.name;
        restoreOwner(plaza, same, visitor, rejoin);
        return { token, member: same };
    }
    if (plaza.members.length >= MAX_MEMBERS) throw new RoomError(409, 'このルームはいっぱいです');
    const { member, token } = newMember(visitor, now);
    plaza.members.push(member);
    restoreOwner(plaza, member, visitor, rejoin);
    if (visitor.profileId) plaza.requests = plaza.requests.filter(request => request.profileId !== visitor.profileId);
    return { token, member };
}

/** A closed plaza's successor: the same name, rules and visibility, with a new creator and owner. */
export function succeed(closed: Room, id: string, visitor: Visitor, now = Date.now()) {
    const old = closed.plaza!;
    const made = createPlaza(id, { rules: closed.plaza!.nextRules ?? closed.rules, plaza: { name: old.name, visibility: old.visibility } }, visitor, now);
    made.room.plaza!.predecessor = closed.id;
    return made;
}

/** The online members, and since when the others are away. True when anything changed. */
export function notePresence(room: Room, online: ReadonlySet<string>, now: number): boolean {
    if (!room.plaza || room.status === 'closed') return false;
    let changed = false;
    for (const member of room.plaza.members) {
        if (online.has(member.id) && member.away !== undefined) { delete member.away; changed = true; }
        else if (!online.has(member.id) && member.away === undefined) { member.away = now; changed = true; }
    }
    return changed;
}

/** A seat for the CPU, with a deck made for the room's rules. */
function cpuSeat(room: Room, cpu: CpuLevel, catalog: Catalog, chosen?: Deck): Seat {
    const errors = chosen ? roomDeckErrors(chosen, room.rules, catalog) : [];
    if (errors.length) throw new RoomError(400, errors.join(' / '));
    const made = chosen ?? randomDeck(room.rules, catalog, randomInt(2 ** 31));
    if (!made) throw new RoomError(409, 'このルールではCPUのデッキを作れません');
    return { tokenHash: '', name: `CPU・${cpuProfiles[cpu].name}`, deck: chosen ?? { ...made, name: 'おまかせデッキ' }, ready: true, cpu };
}

/** Those seated are no longer ready (somebody new sits across, or the rules changed), except `keep`. */
function unready(room: Room, keep?: string) {
    for (const seat of room.seats) if (seat && !seat.cpu && seat.member !== keep) seat.ready = false;
}

/** The rules changed while seated: a CPU gets a deck for the new ones. */
function rulesChanged(room: Room, rules: RoomRules, catalog: Catalog) {
    room.rules = { ...rules, spectators: true };
    unready(room);
    room.seats = room.seats.map(seat => seat?.cpu ? cpuSeat(room, seat.cpu, catalog) : seat) as Room['seats'];
}

/** After a match: back to the table. Those who left free their seats, the next rules apply. */
function toTable(room: Room, catalog: Catalog) {
    if (room.status !== 'finished') return;
    room.status = 'lobby';
    room.state = null;
    room.resigned = null;
    room.last = null;
    room.seats = room.seats.map(seat => seat?.left ? null : seat) as Room['seats'];
    for (const seat of room.seats) if (seat && !seat.cpu) seat.ready = false;
    const next = room.plaza!.nextRules;
    delete room.plaza!.nextRules;
    if (next) rulesChanged(room, next, catalog);
}

/** `seat` is given up (its member stands or leaves): a match in progress is lost, a finished one keeps its name. */
function vacate(room: Room, seat: Side, reason: MatchEnd, outcome: PlazaOutcome) {
    if (room.status === 'playing') {
        giveUp(room, seat, reason);
        outcome.finished = true;
        room.seats[seat]!.left = true;
    } else if (room.status === 'finished') room.seats[seat]!.left = true;
    // Whoever sits down next asks the other seat again (see `sit`).
    else room.seats[seat] = null;
}

/** The member is no longer in the room. The last one to go closes it. */
function remove(room: Room, id: string, reason: MatchEnd, outcome: PlazaOutcome) {
    const plaza = room.plaza!, gone = plaza.members.find(member => member.id === id);
    plaza.members = plaza.members.filter(member => member.id !== id);
    if (gone && reason === 'disconnect') plaza.former = [...plaza.former ?? [], ...gone.tokens].slice(-MAX_FORMER);
    if (plaza.owner === id) {
        if (reason === 'disconnect' && gone) plaza.formerOwner = { tokens: [...gone.tokens], ...(gone.profileId && { profileId: gone.profileId }) };
        else delete plaza.formerOwner;
        plaza.owner = null;
    }
    const seat = seatOf(room, id);
    if (seat !== null) vacate(room, seat, reason, outcome);
    (outcome.removed ??= []).push(id);
    // A CPU does not keep a room open. A match this just lost is kept for one more change, so the
    // history records how it ended (and who won) rather than a match abandoned.
    if (!plaza.members.length) {
        if (outcome.finished) outcome.emptied = true;
        else closeEmpty(room, outcome);
    }
}

/** Closes a plaza nobody is in. True when it did. */
export function closeEmpty(room: Room, outcome: PlazaOutcome = {}): boolean {
    if (!room.plaza || room.plaza.members.length || room.status === 'closed') return false;
    room.status = 'closed';
    room.state = null;
    delete room.turnClock;
    outcome.closed = true;
    return true;
}

/** Members away for longer than MEMBER_GRACE are no longer in the room; null when nothing changed. */
export function tidyPlaza(room: Room, online: ReadonlySet<string>, now: number): PlazaOutcome | null {
    if (!room.plaza || room.status === 'closed') return null;
    const empty: PlazaOutcome = {};
    if (closeEmpty(room, empty)) return empty;
    const changed = notePresence(room, online, now), outcome: PlazaOutcome = {};
    for (const member of [...room.plaza.members]) if (member.away !== undefined && now - member.away >= MEMBER_GRACE) remove(room, member.id, 'disconnect', outcome);
    if (outcome.removed) syncTurnClock(room, now);
    return outcome.removed || changed ? outcome : null;
}

/** The seat member `id` sits in, or null. */
function seatOf(room: Room, id: string): Side | null {
    const seat = room.seats.findIndex(taken => taken?.member === id);
    return seat < 0 ? null : seat as Side;
}

/** Whether `member` may hand out invitations: the owner of an invite room, anyone in the others. */
const mayInvite = (plaza: Plaza, member: string) => plaza.visibility !== 'invite' || plaza.owner === member;

/** One request of member `id` (as sent). Changes the room or throws RoomError and leaves it as it was. */
export function actPlaza(room: Room, id: string, body: unknown, catalog: Catalog, now = Date.now()): PlazaOutcome {
    const parsed = action.safeParse(body);
    if (!parsed.success) throw new RoomError(400, 'リクエストの形式が正しくありません');
    const plaza = room.plaza!, request = parsed.data, outcome: PlazaOutcome = {};
    const me = plaza.members.find(member => member.id === id);
    if (!me || room.status === 'closed') throw new RoomError(404, 'ルームが見つかりません');
    const mine = seatOf(room, id);
    const seated = () => {
        if (mine === null) throw new RoomError(409, '席に座ってから選んでください');
        return room.seats[mine]!;
    };
    const atTable = () => {
        if (room.status === 'playing') throw new RoomError(409, '対戦が終わってから選べます');
        toTable(room, catalog);
    };
    switch (request.action) {
        case 'chat': {
            const text = request.text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
            if (!text) throw new RoomError(400, 'メッセージを入力してください');
            if (Array.from(text).length > MAX_ROOM_CHAT_LENGTH) throw new RoomError(400, `メッセージは${MAX_ROOM_CHAT_LENGTH}文字までです`);
            const messageId = `${id}:${request.messageId}`, previous = plaza.chat?.find(message => message.id === messageId);
            if (previous) {
                if (previous.text !== text) throw new RoomError(409, '送信済みのメッセージです');
            } else {
                if (me.lastChatAt !== undefined && now - me.lastChatAt < 1000) throw new RoomError(429, '少し待ってから送信してください');
                me.lastChatAt = now;
                plaza.chat = [...plaza.chat ?? [], { id: messageId, member: id, name: me.name, ...(me.profileId && { profileId: me.profileId }), text, sentAt: now }].slice(-MAX_ROOM_CHAT_MESSAGES);
            }
            outcome.chat = true;
            return outcome; // Conversation never touches the match, its last command or turn clock.
        }
        case 'ready': {
            const own = seated();
            if (room.status !== 'lobby') throw new RoomError(409, room.status === 'finished' ? '「もう一度」を選んでから準備してください' : '対戦中はデッキを変えられません');
            const errors = roomDeckErrors(request.deck, room.rules, catalog);
            if (errors.length) throw new RoomError(400, errors.join(' / '));
            own.deck = request.deck;
            own.ready = true;
            if (room.seats.every(seat => seat?.ready)) {
                startMatch(room, catalog);
                outcome.started = true;
            }
            break;
        }
        case 'unready':
            if (room.status !== 'lobby') throw new RoomError(409, '対戦はもう始まっています');
            seated().ready = false;
            break;
        case 'command': {
            seated();
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            if (turnTimeoutCommand(room, now)) throw new RoomError(409, '制限時間になりました。ターンを終了しています');
            const state = room.state, sent = { ...request.command, actor: mine! } as Parameters<typeof applyMatchCommand>[1];
            if (state.phase === 'playing' && request.revision !== state.revision) throw new RoomError(409, '盤面が更新されました。もう一度操作してください');
            Object.assign(outcome, applyMatchCommand(room, sent, catalog));
            break;
        }
        case 'resign':
            seated();
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            giveUp(room, mine!);
            outcome.finished = true;
            break;
        case 'rematch':
            // Keeps the seat: back at the table for the next match (the deck is chosen again).
            seated();
            atTable();
            break;
        case 'leave':
            remove(room, id, 'leave', outcome);
            break;
        case 'sit': {
            atTable();
            if (room.seats[request.seat]) throw new RoomError(409, 'その席にはもう誰かが座っています');
            if (mine !== null) room.seats[mine] = null;
            room.seats[request.seat] = { tokenHash: '', member: id, name: me.name, ...(me.profileId && { profileId: me.profileId }), ...(me.historyOwners && { historyOwners: me.historyOwners }), deck: null, ready: false };
            unready(room, id);
            break;
        }
        case 'stand':
            if (mine === null) throw new RoomError(409, '席に座っていません');
            if (room.status === 'finished') {
                toTable(room, catalog);
                room.seats[mine] = null;
            } else vacate(room, mine, 'leave', outcome);
            break;
        case 'cpu': {
            atTable();
            if (room.seats[request.seat] && !room.seats[request.seat]?.cpu) throw new RoomError(409, 'その席にはもう誰かが座っています');
            if (room.seats.some((seat, index) => seat?.cpu && index !== request.seat)) throw new RoomError(409, 'CPUはもう来ています');
            room.seats[request.seat] = cpuSeat(room, request.level, catalog, request.deck);
            // Whoever called the CPU keeps their readiness; anyone else seated is asked again.
            unready(room, id);
            if (room.seats.every(seat => seat?.ready)) {
                startMatch(room, catalog);
                outcome.started = true;
            }
            break;
        }
        case 'dismissCpu': {
            atTable();
            const seat = room.seats.findIndex(taken => taken?.cpu);
            if (seat < 0) throw new RoomError(409, 'CPUはいません');
            room.seats[seat] = null;
            break;
        }
        case 'claim':
            if (plaza.owner !== null) throw new RoomError(409, 'ほかの人がオーナーになりました');
            if (!mayClaim(plaza, me)) throw new RoomError(403, 'ログイン中の人が先にオーナーを引き継げます');
            plaza.owner = id;
            delete plaza.formerOwner;
            break;
        case 'rules': {
            if (plaza.owner !== id) throw new RoomError(403, 'ルールを変えられるのはオーナーだけです');
            const rules = parseRoomRules(request.rules);
            if (!rules) throw new RoomError(400, '使えるフルーツを1つ以上選んでください');
            if (room.status === 'lobby') rulesChanged(room, rules, catalog);
            else plaza.nextRules = { ...rules, spectators: true };
            break;
        }
        case 'rename': {
            if (plaza.owner !== id) throw new RoomError(403, 'ルーム名を変えられるのはオーナーだけです');
            const name = roomName(request.name, '');
            if (!name) throw new RoomError(400, 'ルーム名を入力してください');
            plaza.name = name;
            break;
        }
        case 'renewInvite':
            if (!invitedVisibility(plaza.visibility)) throw new RoomError(409, 'このルームはリンクだけで招待できます');
            if (!mayInvite(plaza, id)) throw new RoomError(403, '招待できるのはオーナーだけです');
            plaza.invite = secret();
            break;
        case 'answer': {
            if (!mayInvite(plaza, id)) throw new RoomError(403, '招待できるのはオーナーだけです');
            const asked = plaza.requests.some(entry => entry.profileId === request.profileId);
            plaza.requests = plaza.requests.filter(entry => entry.profileId !== request.profileId);
            if (asked && request.accept) {
                if (!plaza.allowed.includes(request.profileId)) plaza.allowed = [...plaza.allowed, request.profileId].slice(-MAX_ALLOWED);
                outcome.invited = request.profileId;
            }
            break;
        }
    }
    if (!outcome.command) room.last = null;
    syncTurnClock(room, now);
    return outcome;
}

/**
 * Member `id` invites a signed-in friend by name (the server checked the friendship). In an invited
 * room they are let in by name; in the others they may come in already (`entryOf`), so they are only
 * told: in a friends' room only its creator's friends may, so only the creator invites there.
 */
export function inviteByName(room: Room, id: string, profileId: string): PlazaOutcome {
    const plaza = room.plaza!;
    if (room.status === 'closed' || !plaza.members.some(member => member.id === id)) throw new RoomError(404, 'ルームが見つかりません');
    if (!mayInvite(plaza, id)) throw new RoomError(403, '招待できるのはオーナーだけです');
    if (plaza.visibility === 'friends' && plaza.members.find(member => member.id === id)?.profileId !== plaza.creator.profileId)
        throw new RoomError(403, 'このルームに入れるのは作った人のフレンドだけです');
    if (invitedVisibility(plaza.visibility) && !plaza.allowed.includes(profileId)) plaza.allowed = [...plaza.allowed, profileId].slice(-MAX_ALLOWED);
    room.last = null;
    return { invited: profileId };
}

/** A friend of a member asks to be let in. False when they may come in already or the room is not asked like this. */
export function askToEnter(room: Room, visitor: Required<Pick<Visitor, 'profileId'>> & Visitor, now = Date.now()): boolean {
    const plaza = room.plaza;
    if (!plaza || room.status === 'closed' || !invitedVisibility(plaza.visibility) || entryOf(room, visitor, null) === 'yes') return false;
    plaza.requests = [...plaza.requests.filter(entry => entry.profileId !== visitor.profileId), { profileId: visitor.profileId, name: visitor.name, at: now }].slice(-MAX_REQUESTS);
    return true;
}

/** What member `id` is told about the room. Those not seated watch the match without its hidden cards. */
export function plazaView(room: Room, id: string, online: ReadonlySet<string>, catalog: Catalog, chatHistory = true): RoomView {
    const plaza = room.plaza!, { version, status, match, rules, last, resigned, seats, state, record, turnClock } = room;
    const mine = seatOf(room, id), seated = mine !== null;
    const players = seats.map((seat, index) => seat && {
        name: seat.name, ...(seat.profileId && { profileId: seat.profileId }), ready: seat.ready, online: !!seat.cpu || online.has(seat.member!),
        ...(seat.left && { left: true }), ...((index === mine || seat.cpu) && seat.deck && { deck: seat.deck.name }),
        ...(seat.member && { member: seat.member }), ...(seat.cpu && { cpu: seat.cpu }),
    }) as RoomView['players'];
    const shares = mayInvite(plaza, id);
    return {
        id: room.id, version, seat: mine ?? 0, ...(!seated && { watching: true as const }), reportsAway: true,
        spectators: plaza.members.filter(member => online.has(member.id) && !seats.some(seat => seat?.member === member.id)).length,
        ...(mine !== null && seats[mine]!.deck && { ownDeck: seats[mine]!.deck! }),
        status, match, ...(record && { matchId: record.id }), rules, players, game: state && viewFor(state, mine ?? 'spectator'), last, resigned,
        assessment: publicAssessment(room, catalog),
        ...(status === 'finished' && record && seated && { replayId: record.id }),
        ...(turnClock && { turnClock, serverNow: Date.now() }),
        plaza: {
            name: plaza.name, visibility: plaza.visibility, creator: plaza.creator, owner: plaza.owner, me: id,
            canClaimOwner: plaza.owner === null && !!plaza.members.find(member => member.id === id && mayClaim(plaza, member, online)),
            chatEnabled: true, ...(chatHistory && { chat: plaza.chat ?? [] }),
            members: plaza.members.map(member => {
                const seat = seats.findIndex(taken => taken?.member === member.id);
                return { id: member.id, name: member.name, ...(member.profileId && { profileId: member.profileId }), online: online.has(member.id), ...(seat >= 0 && { seat: seat as Side }) };
            }),
            ...(plaza.nextRules && { nextRules: plaza.nextRules }),
            ...(shares && plaza.invite && { invite: plaza.invite }),
            ...(shares && plaza.requests.length && { requests: plaza.requests.map(({ profileId, name }) => ({ profileId, name })) }),
        },
    };
}

/** What someone who may enter the room is told before they do. */
export function plazaInfo(room: Room): RoomInfo {
    const plaza = room.plaza!;
    return {
        id: room.id, status: room.status, rules: plaza.nextRules ?? room.rules, host: plaza.creator.name, ...(plaza.creator.profileId && { hostProfileId: plaza.creator.profileId }),
        open: room.status !== 'closed' && plaza.members.length < MAX_MEMBERS, spectators: true,
        plaza: { name: plaza.name, visibility: plaza.visibility, creator: plaza.creator, members: plaza.members.length, seated: room.seats.filter(Boolean).length },
    };
}

/** The CPU seat that has to act now, or null. */
export function cpuToAct(room: Room): Side | null {
    const state = room.state;
    if (!room.plaza || room.status !== 'playing' || !state || state.winner !== null) return null;
    const seat = room.seats.findIndex(taken => taken?.cpu);
    return seat >= 0 && actingSides(state).includes(seat as Side) ? seat as Side : null;
}

/** The CPU's command, decided on the position at `revision` of match `match`, if that is still the position. */
export function playCpu(room: Room, seat: Side, sent: Parameters<typeof applyMatchCommand>[1], expected: { match: number; revision: number }, catalog: Catalog, now = Date.now()): Outcome {
    if (room.match !== expected.match || room.state?.revision !== expected.revision || cpuToAct(room) !== seat) throw new RoomError(409, 'stale');
    const outcome = applyMatchCommand(room, { ...sent, actor: seat }, catalog);
    syncTurnClock(room, now);
    return outcome;
}
