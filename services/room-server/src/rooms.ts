import { publicAssessment } from './public-assessment.ts';
import { catalog as roomCatalog } from './catalog.ts';
// ルームの完全な状態に対する操作。
// 接続や保存先には依存せず、要求に応じて状態を変更する。
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { applyCommand, decideMatch, newGame, other, sandboxRules, viewFor } from '@pplale/game-core';
import type { Catalog, CpuLevel, Deck, GameState, Side } from '@pplale/game-core';
import { MAX_NAME_LENGTH, parseRoomRules, roomDeckErrors } from '@pplale/game-core/room';
import type { MatchEnd } from '@pplale/game-core/history';
import type { LastCommand, RoomCommand, RoomInfo, RoomRules, RoomStatus, RoomTurnClock, RoomView } from '@pplale/game-core/room';
import { syncTurnClock, turnTimeoutCommand } from './turn-clock.ts';
import type { Plaza } from './plaza.ts';

export interface Seat {
    /** 検証済みの認証情報からだけ設定する公開プロフィールID。 */
    profileId?: string;
    /** 認証済みアカウントと端末の履歴所有者。RoomViewへ含めない。 */
    historyOwners?: string[];
    /** 座席トークンのSHA-256。元の秘密は本人のブラウザだけで保持する。 */
    tokenHash: string;
    name: string;
    deck: Deck | null;
    ready: boolean;
    /** 対戦中または終了後に退出した席。本人が操作すると解除する。 */
    left?: boolean;
    /** ルームの席に座るメンバー。メンバー自身のトークンを使い、座席用のtokenHashは空にする。 */
    member?: string;
    /** この席はサーバーのCPUが操作する。 */
    cpu?: CpuLevel;
}
export interface Room {
    turnClock?: RoomTurnClock;
    /** 明示的に中断したCPU戦の記録ID。履歴からこの試合だけを破棄する。 */
    discardedMatch?: string;
    record?: { id: string; startedAt: number; reason?: MatchEnd };
    id: string;
    mode?: 'free';
    version: number;
    status: RoomStatus;
    match: number;
    rules: RoomRules;
    /** 旧2席ルームは先攻側の席を必ず持つ。通常ルームは両席とも空にできる。 */
    seats: [Seat | null, Seat | null];
    /** 集まって遊ぶルームの在室情報。 */
    plaza?: Plaza;
    state: GameState | null;
    last: LastCommand | null;
    resigned: Side | null;
    /** 各席の切断開始時刻。接続中はnull。古いルームでは省略される。 */
    away?: [number | null, number | null];
}

/** 許可できない要求。statusはHTTP状態、messageはユーザー向けの理由。 */
export class RoomError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export const side = z.union([z.literal(0), z.literal(1)]);
const uid = z.string().max(16);
// 受信したactorは信用せず、送信者の席で置き換える。
export const command = z.discriminatedUnion('type', [
    z.object({ type: z.literal('roll'), actor: side }),
    z.object({ type: z.literal('initiative'), actor: side, order: z.enum(['first', 'second']) }),
    z.object({ type: z.literal('openingDraw'), actor: side, deck: z.enum(['yojo', 'sweet']) }),
    z.object({ type: z.literal('mulligan'), actor: side, uids: z.array(uid).max(10) }),
    z.object({ type: z.literal('keep'), actor: side }),
    z.object({ type: z.literal('play'), actor: side, uid, slot: z.number().int().min(0).max(6).optional() }),
    z.object({ type: z.literal('attack'), actor: side, uid, target: uid }),
    z.object({ type: z.literal('end'), actor: side }),
    z.object({ type: z.literal('choose'), actor: side, option: z.string().max(32) }),
    z.object({ type: z.literal('skill'), actor: side, index: z.number().int().min(0).max(30) }),
    z.object({ type: z.literal('reveal'), actor: side, uid }),
    z.object({ type: z.literal('exSkill'), actor: side, skill: z.enum(['dice', 'strawberryHunt', 'healing', 'abyss', 'dagger', 'alice', 'smoke', 'kamikakushi']) }),
    z.object({ type: z.literal('acorn'), actor: side, mode: z.enum(['draw', 'pp']) }),
]);
const cardIds = z.array(z.string().max(16)).max(40);
export const deck = z.object({ name: z.string().max(60), yojo: cardIds, sweet: cardIds, playable: z.string().max(16) });
const action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('ready'), deck }),
    z.object({ action: z.literal('unready') }),
    z.object({ action: z.literal('command'), command, revision: z.number().int() }),
    z.object({ action: z.literal('resign') }),
    z.object({ action: z.literal('rematch') }),
    z.object({ action: z.literal('leave') }),
]);

export const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/** 相手に見せる名前。短い1行に整え、空にはしない。 */
export function playerName(value: unknown, fallback: string, length = MAX_NAME_LENGTH) {
    const name = typeof value === 'string' ? Array.from(value.replace(/\p{C}/gu, '').trim()).slice(0, length).join('') : '';
    return name || fallback;
}
function newSeat(name: string): { seat: Seat; token: string } {
    const token = randomBytes(32).toString('base64url');
    return { seat: { tokenHash: hash(token), name, deck: null, ready: false }, token };
}

/** トークンが対応する席。該当しなければnull。 */
export function seatOf(room: Room, token: unknown): Side | null {
    const given = Buffer.from(hash(typeof token === 'string' ? token : ''));
    // 通常ルームはメンバーのトークンを使う。CPUも座席固有の秘密は持たない。
    const index = room.seats.findIndex(seat => seat?.tokenHash.length === given.length && timingSafeEqual(Buffer.from(seat.tokenHash), given));
    return index < 0 ? null : index as Side;
}

/** 現在の接続状況。席・観戦人数・ルームメンバーを区別する。 */
export interface Present { online: [boolean, boolean]; watching: number; members?: string[] }

/** 席または観戦者向けのルーム表示。 */
export function seatView(room: Room, seat: Side | 'spectator', { online, watching }: Present): RoomView {
    const { id, mode, version, status, match, rules, last, resigned, seats, state, record, turnClock } = room;
    const players = seats.map((s, index) => s && { name: s.name, ...(s.profileId && { profileId: s.profileId }), ready: s.ready, online: online[index], ...(s.left && { left: true }), ...(index === seat && s.deck && { deck: s.deck.name }) }) as RoomView['players'];
    return {
        id, ...(mode && { mode }), version, seat: seat === 'spectator' ? 0 : seat, ...(seat === 'spectator' ? { watching: true as const } : { reportsAway: true as const }), spectators: watching,
        ...(seat !== 'spectator' && seats[seat]?.deck && { ownDeck: seats[seat]!.deck! }),
        status, match, ...(record && { matchId: record.id }), rules, players, game: state && viewFor(state, seat === 'spectator' && mode === 'free' && status === 'playing' ? 'audience' : seat), last, resigned,
        assessment: publicAssessment(room, roomCatalog),
        ...(status === 'finished' && record && (seat !== 'spectator' || mode === 'free') && { replayId: record.id }),
        ...(turnClock && { turnClock, serverNow: Date.now() }),
    };
}
export const roomInfo = (room: Room): RoomInfo =>
    ({ id: room.id, status: room.status, rules: room.rules, host: room.seats[0]!.name, ...(room.seats[0]!.profileId && { hostProfileId: room.seats[0]!.profileId }), open: room.status === 'lobby' && !room.seats[1], spectators: !!room.rules.spectators });

/** 作成者が着席した旧形式のルームを作る。 */
export function createRoom(id: string, body: unknown): { room: Room; token: string } {
    const input = body as { rules?: unknown; name?: unknown } | null;
    const rules = parseRoomRules(input?.rules);
    if (!rules) throw new RoomError(400, '使えるフルーツを1つ以上選んでください');
    const { seat, token } = newSeat(playerName(input?.name, 'ホスト'));
    return { room: { id, version: 1, status: 'lobby', match: 0, rules, seats: [seat, null], state: null, last: null, resigned: null }, token };
}

/** 来訪者を着席させ、その席の秘密を返す。 */
export function joinRoom(room: Room, body: unknown): string {
    if (room.status === 'closed') throw new RoomError(410, 'このルームは解散しました');
    if (room.status !== 'lobby' || room.seats[1]) throw new RoomError(409, 'このルームは満員です');
    const { seat, token } = newSeat(playerName((body as { name?: unknown } | null)?.name, 'ゲスト'));
    room.seats[1] = seat;
    return token;
}

/** カードのuidから種類を推測されないよう、作成前に順番を混ぜる。 */
export function mixed(ids: string[]) {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
export function startMatch(room: Room, catalog: Catalog) {
    const decks = room.seats.map(seat => ({ ...seat!.deck!, name: seat!.name, yojo: mixed(seat!.deck!.yojo), sweet: mixed(seat!.deck!.sweet) })) as [Deck, Deck];
    room.state = newGame(decks, catalog, { ...sandboxRules }, randomInt(2 ** 32));
    room.status = 'playing';
    room.record = { id: randomUUID(), startedAt: Date.now() };
    room.match++;
    room.resigned = null;
}
export function giveUp(room: Room, seat: Side, reason: MatchEnd = 'resign') {
    if (room.record) room.record.reason = reason;
    const state = room.state!;
    decideMatch(state, other(seat), 'resign');
    state.pending = null;
    state.queue = [];
    state.log.push(`${state.players[seat].name}が投了しました`);
    state.revision++;
    room.status = 'finished';
    room.resigned = seat;
}

/** 誰も見ていないルームを保持する時間（ミリ秒）。 */
export interface Patience {
    /** 準備中の猶予。ホスト不在なら閉鎖、相手不在ならその席を空ける。 */
    lobby: number;
    /** 対戦中・終了後に両者が不在になってから閉じるまでの時間。 */
    match: number;
}
/** 接続状態から各席の不在時間を更新し、期限を過ぎたルームや席を片付ける。変更がなければnull。 */
export function tidy(room: Room, online: [boolean, boolean], now: number, patience: Patience): 'closed' | 'vacated' | 'away' | 'finished' | null {
    if (room.status === 'closed') return null;
    const before = room.away ?? [null, null];
    const away = room.seats.map((seat, index) => !seat || online[index] ? null : before[index] ?? now) as [number | null, number | null];
    const changed = away.some((since, index) => since !== before[index]);
    room.away = away;
    const longer = (index: Side, limit: number) => away[index] !== null && now - away[index]! >= limit;
    // ページを閉じた相手を、もう一方がいつまでも待ち続けないようにする。
    if (room.mode === 'free' && room.status === 'playing') {
        const absent = ([0, 1] as const).find(seat => longer(seat, 60_000));
        if (absent !== undefined) {
            giveUp(room, absent, 'disconnect');
            room.seats[absent]!.left = true;
            return 'finished';
        }
    }
    if (room.status === 'lobby' && longer(0, patience.lobby)) {
        room.status = 'closed';
        return 'closed';
    }
    if (room.status === 'lobby' && room.seats[1] && longer(1, patience.lobby)) {
        room.seats[1] = null;
        away[1] = null;
        return 'vacated';
    }
    if (room.status !== 'lobby' && longer(0, patience.match) && longer(1, patience.match)) {
        room.status = 'closed';
        room.state = null;
        return 'closed';
    }
    return changed ? 'away' : null;
}

/** 状態変更に加え、サーバーの集計や接続管理で必要になる情報。 */
export interface Outcome {
    started?: true;
    finished?: true;
    command?: true;
    /** 相手の席が解放されたため、その接続を閉じる。 */
    vacated?: true;
}

/** 席からの要求を検証して反映する。拒否する場合はRoomErrorを返す。 */
export function act(room: Room, seat: Side, body: unknown, catalog: Catalog, now = Date.now()): Outcome {
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
            if (turnTimeoutCommand(room, now)) throw new RoomError(409, '制限時間になりました。ターンを終了しています');
            const state = room.state, sent = { ...request.command, actor: seat } as RoomCommand;
            // 通常ターンでは、古い盤面から作った操作を拒否する。
            // 初期ドローと手札交換は両者が同時に操作できる。
            if (state.phase === 'playing' && request.revision !== state.revision) throw new RoomError(409, '盤面が更新されました。もう一度操作してください');
            Object.assign(outcome, applyMatchCommand(room, sent, catalog));
            break;
        }
        case 'resign':
            if (room.status !== 'playing' || !room.state) throw new RoomError(409, '対戦中ではありません');
            giveUp(room, seat);
            outcome.finished = true;
            break;
        case 'rematch':
            if (room.mode === 'free') throw new RoomError(409, 'フリーマッチでは次の対戦相手を探してください');
            if (room.status !== 'finished') throw new RoomError(409, '対戦が終わってから選べます');
            // デッキ選択へ戻り、両者の準備がそろったら次の試合を開始する。
            room.status = room.seats[0]!.left ? 'closed' : 'lobby';
            room.state = null;
            room.resigned = null;
            // 退出した相手の席は、次の参加者へ解放する。
            if (room.seats[1]?.left) room.seats[1] = null;
            for (const s of room.seats) if (s) s.ready = false;
            break;
        case 'leave':
            if (room.status === 'playing' || room.status === 'finished') {
                if (room.status === 'playing') {
                    giveUp(room, seat, 'leave');
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
    // 直前の操作で公開した情報は、その更新だけに付ける。
    if (!outcome.command) room.last = null;
    syncTurnClock(room, now);
    return outcome;
}

export function applyMatchCommand(room: Room, sent: RoomCommand, catalog: Catalog, notice?: string): Outcome {
    const state = room.state!;
    const cardId = sent.type === 'play' || sent.type === 'reveal' ? state.cards[sent.uid]?.cardId : undefined;
    const input = notice ? { ...state, log: [...state.log, notice].slice(-100) } : state;
    const result = applyCommand(input, sent, catalog);
    if (result.error) throw new RoomError(422, result.error);
    room.state = result.state;
    room.last = { command: sent, ...(cardId && { cardId }) };
    if (result.state.winner !== null) room.status = 'finished';
    return { command: true, ...(room.status === 'finished' && { finished: true }) };
}

/** プレイヤーの操作と同じく、ルームの更新と同時にCASで確定する。 */
export function expireTurn(room: Room, catalog: Catalog, now = Date.now()): Outcome | null {
    const command = turnTimeoutCommand(room, now);
    if (!command) return null;
    const first = !room.turnClock!.expired;
    const notice = first ? `${room.state!.players[command.actor].name}の制限時間になりました。選択を自動で完了してターンを終了します` : undefined;
    const outcome = applyMatchCommand(room, command, catalog, notice);
    room.turnClock!.expired = true;
    syncTurnClock(room, now);
    return outcome;
}
