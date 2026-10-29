// ルームの入退室・席・オーナー・ルールを管理する。接続や保存には依存せず、要求に応じて状態を変更する。
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { other, actingSides, cpuLevels, cpuProfiles, randomDeck, viewFor } from '@pplale/game-core';
import type { Catalog, CpuLevel, Deck, Side } from '@pplale/game-core';
import { DEFAULT_VISIBILITY, MAX_MEMBERS, MAX_ROOM_NAME_LENGTH, MEMBER_GRACE, invitedVisibility, isRoomVisibility, parseRoomRules, roomDeckErrors } from '@pplale/game-core/room';
import type { RoomChatMessage } from '@pplale/game-core/room';
import type { RoomInfo, RoomRules, RoomView, RoomVisibility } from '@pplale/game-core/room';
import type { MatchEnd } from '@pplale/game-core/history';
import { publicAssessment } from './public-assessment.ts';
import { RoomError, applyMatchCommand, command, deck, giveUp, hash, playerName, side, startMatch } from './rooms.ts';
import type { Outcome, Room, Seat } from './rooms.ts';
import { appendChatMessage, chatActionSchema } from './chat.ts';
import { syncTurnClock, turnTimeoutCommand } from './turn-clock.ts';

export interface PlazaMember {
    id: string;
    /** 本人として入った各ブラウザのトークンのSHA-256。新しいものを末尾に置く。 */
    tokens: string[];
    name: string;
    /** 検証済みの認証情報からだけ設定する公開プロフィールID。 */
    profileId?: string;
    /** 認証済みアカウントと端末の履歴所有者。表示用の情報へ含めない。 */
    historyOwners?: string[];
    lastChatAt?: number;
    /** すべての接続が切れた時刻。接続中は設定しない。 */
    away?: number;
}
export interface Plaza {
    /** 同じルームIDが後から再利用されても、別のルームとして区別するためのキー。 */
    key: string;
    name: string;
    visibility: RoomVisibility;
    /** 作成時点の作成者。後から変更しない。 */
    creator: { name: string; profileId?: string };
    /** ルールを変更できる現在のメンバー。不在時はnull。 */
    owner: string | null;
    /** 切断したオーナーの証明。明示的な退出や次の権限取得で破棄する。 */
    formerOwner?: { tokens: string[]; profileId?: string };
    members: PlazaMember[];
    chat?: RoomChatMessage[];
    /** 招待リンクの秘密。更新すると古いリンクは失効する。 */
    invite?: string;
    /** 招待または入室リクエストの承認により、名前で入室を許可したユーザー。 */
    allowed: string[];
    /** 入室をリクエストした、在室者のフレンド。 */
    requests: { profileId: string; name: string; at: number }[];
    /** 対戦中に設定された、次の試合のルール。 */
    nextRules?: RoomRules;
    /** 引き継ぎ元と、このルームが閉じた後の引き継ぎ先。 */
    predecessor?: string;
    successor?: string;
    /** 切断猶予が過ぎたメンバーのトークンのハッシュ。再入室と後継作成の証明に使う。 */
    former?: string[];
}

/** 入室を求める本人の検証済みプロフィールID・履歴所有者・表示名。 */
export interface Visitor { profileId?: string; historyOwners?: string[]; name: string }

/** ルームの変更に加え、接続・通知などで必要になる処理。 */
export interface PlazaOutcome extends Outcome {
    chat?: true;
    /** 在室扱いでなくなったメンバー。この人の接続を閉じる。 */
    removed?: string[];
    /** 名前で入室を許可した相手。通知先として使う。 */
    invited?: string;
    /** 最後の人が退出し、ルームが閉じた。 */
    closed?: true;
    /** 最後の退出と同時に試合が終わった場合。結果を保存してからcloseEmptyで閉じる。 */
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
    z.object({ action: z.literal('abort'), match: z.number().int().nonnegative() }),
    z.object({ action: z.literal('rematch') }),
    z.object({ action: z.literal('leave') }),
    z.object({ action: z.literal('sit'), seat: side }),
    z.object({ action: z.literal('stand') }),
    z.object({ action: z.literal('cpu'), seat: side, level, deck: deck.optional() }),
    z.object({ action: z.literal('dismissCpu') }),
    z.object({ action: z.literal('claim') }),
    z.object({ action: z.literal('rules'), rules: z.unknown() }),
    z.object({ action: z.literal('rename'), name: z.string() }),
    chatActionSchema,
    z.object({ action: z.literal('renewInvite') }),
    z.object({ action: z.literal('answer'), profileId, accept: z.boolean() }),
]);

/** 表示用のルーム名。短い1行に整え、空にはしない。 */
export const roomName = (value: unknown, fallback: string) => playerName(value, fallback, MAX_ROOM_NAME_LENGTH);

function newMember(visitor: Visitor, now: number): { member: PlazaMember; token: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, member: {
        id: randomUUID().slice(0, 8), tokens: [hash(token)], name: visitor.name,
        ...(visitor.profileId && { profileId: visitor.profileId }), ...(visitor.historyOwners?.length && { historyOwners: visitor.historyOwners }),
        // 接続を開くまでの時間も、切断猶予に含める。
        away: now,
    } };
}

/** 作成者をオーナーとして入室させる。公開範囲が不正な場合は、誤って公開せずインバイトにする。 */
export function createPlaza(id: string, body: unknown, visitor: Visitor, now = Date.now()): { room: Room; token: string } {
    const input = body as { rules?: unknown; plaza?: { name?: unknown; visibility?: unknown } } | null;
    const rules = parseRoomRules(input?.rules);
    if (!rules) throw new RoomError(400, '使えるフルーツを1つ以上選んでください');
    const asked = isRoomVisibility(input?.plaza?.visibility) ? input.plaza.visibility : DEFAULT_VISIBILITY;
    // ゲストのフレンド制ルームは誰も入れなくなるため、インバイトとして作る。
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

/** トークンが対応するメンバー。該当しなければnull。 */
export function memberOf(room: Room, token: unknown): PlazaMember | null {
    if (typeof token !== 'string' || !room.plaza) return null;
    const given = Buffer.from(hash(token));
    return room.plaza.members.find(member => member.tokens.some(saved => saved.length === given.length && timingSafeEqual(Buffer.from(saved), given))) ?? null;
}

/** 切断猶予が過ぎたメンバーの証明か。明示的に退出した人の証明は使えない。 */
export function formerOf(room: Room, token: unknown): boolean {
    if (typeof token !== 'string' || !room.plaza?.former) return false;
    const given = Buffer.from(hash(token));
    return room.plaza.former.some(saved => saved.length === given.length && timingSafeEqual(Buffer.from(saved), given));
}

/** 現在の認証アカウントが一致する場合だけ、既存メンバーのトークンを再利用できる。 */
export function rejoiningMember(room: Room, visitor: Visitor, token: unknown): PlazaMember | null {
    const member = memberOf(room, token);
    return member && member.profileId === visitor.profileId ? member : null;
}

/** 接続中のログイン済み参加者がいない場合、ゲストもオーナーを引き継げる。 */
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

/** 入室の可否、または確認が必要なフレンド関係を返す。実際の関係はサーバー側で確認する。 */
export function entryOf(room: Room, visitor: Pick<Visitor, 'profileId'>, invite: unknown): 'yes' | 'no' | { friendsOf: string[] } {
    const plaza = room.plaza!, uid = visitor.profileId;
    // 名前による招待は非公開ルームの許可に使う。フレンド制の入室条件は緩めない。
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

/** 許可済みの本人を入室させる。同じアカウントの別端末でも同じメンバーにまとめ、トークンだけを追加する。 */
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

/** 同じ名前・ルール・公開範囲の後継ルームを作る。新しい作成者とオーナーは今回の本人。 */
export function succeed(closed: Room, id: string, visitor: Visitor, now = Date.now()) {
    const old = closed.plaza!;
    const made = createPlaza(id, { rules: closed.plaza!.nextRules ?? closed.rules, plaza: { name: old.name, visibility: old.visibility } }, visitor, now);
    made.room.plaza!.predecessor = closed.id;
    return made;
}

/** 接続状態と切断開始時刻を更新する。変更があればtrue。 */
export function notePresence(room: Room, online: ReadonlySet<string>, now: number): boolean {
    if (!room.plaza || room.status === 'closed') return false;
    let changed = false;
    for (const member of room.plaza.members) {
        if (online.has(member.id) && member.away !== undefined) { delete member.away; changed = true; }
        else if (!online.has(member.id) && member.away === undefined) { member.away = now; changed = true; }
    }
    return changed;
}

/** ルームのルールに合ったデッキを持つCPU席を作る。 */
function cpuSeat(room: Room, cpu: CpuLevel, catalog: Catalog, chosen?: Deck): Seat {
    const errors = chosen ? roomDeckErrors(chosen, room.rules, catalog) : [];
    if (errors.length) throw new RoomError(400, errors.join(' / '));
    const made = chosen ?? randomDeck(room.rules, catalog, randomInt(2 ** 31));
    if (!made) throw new RoomError(409, 'このルールではCPUのデッキを作れません');
    return { tokenHash: '', name: `CPU・${cpuProfiles[cpu].name}`, deck: chosen ?? { ...made, name: 'おまかせデッキ' }, ready: true, cpu };
}

/** keep以外の人の準備完了を解除する。相手の交代やルール変更時に使う。 */
function unready(room: Room, keep?: string) {
    for (const seat of room.seats) if (seat && !seat.cpu && seat.member !== keep) seat.ready = false;
}

/** ルール変更時には、CPUのデッキも新しい条件に合わせる。 */
function rulesChanged(room: Room, rules: RoomRules, catalog: Catalog) {
    room.rules = { ...rules, spectators: true };
    unready(room);
    room.seats = room.seats.map(seat => seat?.cpu ? cpuSeat(room, seat.cpu, catalog) : seat) as Room['seats'];
}

/** 対戦後に準備へ戻す。退出済みの席を空け、次のルールを適用する。 */
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

/** 席を離れる。対戦中なら敗北とし、終了済みの対戦者名は残す。 */
function vacate(room: Room, seat: Side, reason: MatchEnd, outcome: PlazaOutcome) {
    if (room.status === 'playing') {
        giveUp(room, seat, reason);
        outcome.finished = true;
        room.seats[seat]!.left = true;
    } else if (room.status === 'finished') room.seats[seat]!.left = true;
    // 次の着席時に、相手側の準備を確認し直す。
    else room.seats[seat] = null;
}

/** メンバーを退出させる。最後の人ならルームを閉じる。 */
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
    // CPUだけではルームを存続させない。退出による決着は、もう1回の更新まで残す。
    // 勝者と退出理由を保存してから閉じ、中断扱いの記録にしないため。
    if (!plaza.members.length) {
        if (outcome.finished) outcome.emptied = true;
        else closeEmpty(room, outcome);
    }
}

/** 誰もいないルームを閉じる。閉じた場合はtrue。 */
export function closeEmpty(room: Room, outcome: PlazaOutcome = {}): boolean {
    if (!room.plaza || room.plaza.members.length || room.status === 'closed') return false;
    room.status = 'closed';
    room.state = null;
    delete room.turnClock;
    outcome.closed = true;
    return true;
}

/** 切断猶予を過ぎたメンバーを除く。変更がなければnull。 */
export function tidyPlaza(room: Room, online: ReadonlySet<string>, now: number): PlazaOutcome | null {
    if (!room.plaza || room.status === 'closed') return null;
    const empty: PlazaOutcome = {};
    if (closeEmpty(room, empty)) return empty;
    const changed = notePresence(room, online, now), outcome: PlazaOutcome = {};
    for (const member of [...room.plaza.members]) if (member.away !== undefined && now - member.away >= MEMBER_GRACE) remove(room, member.id, 'disconnect', outcome);
    if (outcome.removed) syncTurnClock(room, now);
    return outcome.removed || changed ? outcome : null;
}

/** メンバーが座っている席。着席していなければnull。 */
function seatOf(room: Room, id: string): Side | null {
    const seat = room.seats.findIndex(taken => taken?.member === id);
    return seat < 0 ? null : seat as Side;
}

/** 招待を発行できるか。インバイトはオーナー、それ以外は在室者に許可する。 */
const mayInvite = (plaza: Plaza, member: string) => plaza.visibility !== 'invite' || plaza.owner === member;

/** メンバーの要求を検証して反映する。通信・保存・通知の実行は呼び出し側へ任せる。 */
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
        case 'chat':
            appendChatMessage(plaza, me, request, now);
            return { chat: true };
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
        case 'abort':
            seated();
            if (request.match !== room.match) throw new RoomError(409, '試合が切り替わりました。もう一度確認してください');
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            if (!room.seats[other(mine!)]?.cpu) throw new RoomError(403, '中断できるのはCPUとの対戦だけです');
            room.discardedMatch = room.record?.id;
            delete room.record;
            // 勝敗や終了通知は作らず、準備に戻す処理だけを再利用する。
            room.status = 'finished';
            toTable(room, catalog);
            break;
        case 'resign':
            seated();
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            giveUp(room, mine!);
            outcome.finished = true;
            break;
        case 'rematch':
            // 席を維持して準備へ戻る。次の対戦ではデッキを選び直せる。
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
            // CPUを呼んだ本人の準備は維持し、ほかの着席者には確認し直してもらう。
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

/** サーバーで関係を確認済みのフレンドを招待する。フレンド制の入室条件は緩めず、元から入れる場合は通知だけを送る。 */
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

/** フレンドの入室リクエスト。すでに入室可能、または対象外ならfalse。 */
export function askToEnter(room: Room, visitor: Required<Pick<Visitor, 'profileId'>> & Visitor, now = Date.now()): boolean {
    const plaza = room.plaza;
    if (!plaza || room.status === 'closed' || !invitedVisibility(plaza.visibility) || entryOf(room, visitor, null) === 'yes') return false;
    plaza.requests = [...plaza.requests.filter(entry => entry.profileId !== visitor.profileId), { profileId: visitor.profileId, name: visitor.name, at: now }].slice(-MAX_REQUESTS);
    return true;
}

/** 在室メンバー向けの表示。着席していない人は観戦用の情報を受け取る。 */
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
            chatEnabled: true, chatStamps: true, ...(chatHistory && { chat: plaza.chat ?? [] }),
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

/** 入室可能な人へ返す事前情報。 */
export function plazaInfo(room: Room): RoomInfo {
    const plaza = room.plaza!;
    return {
        id: room.id, status: room.status, rules: plaza.nextRules ?? room.rules, host: plaza.creator.name, ...(plaza.creator.profileId && { hostProfileId: plaza.creator.profileId }),
        open: room.status !== 'closed' && plaza.members.length < MAX_MEMBERS, spectators: true,
        plaza: { name: plaza.name, visibility: plaza.visibility, creator: plaza.creator, members: plaza.members.length, seated: room.seats.filter(Boolean).length },
    };
}

/** 今行動すべきCPUの席。なければnull。 */
export function cpuToAct(room: Room): Side | null {
    const state = room.state;
    if (!room.plaza || room.status !== 'playing' || !state || state.winner !== null) return null;
    const seat = room.seats.findIndex(taken => taken?.cpu);
    return seat >= 0 && actingSides(state).includes(seat as Side) ? seat as Side : null;
}

/** 計算時の試合番号と盤面更新番号が一致する場合だけ、CPUの手を反映する。 */
export function playCpu(room: Room, seat: Side, sent: Parameters<typeof applyMatchCommand>[1], expected: { match: number; revision: number }, catalog: Catalog, now = Date.now()): Outcome {
    if (room.match !== expected.match || room.state?.revision !== expected.revision || cpuToAct(room) !== seat) throw new RoomError(409, 'stale');
    const outcome = applyMatchCommand(room, { ...sent, actor: seat }, catalog);
    syncTurnClock(room, now);
    return outcome;
}
