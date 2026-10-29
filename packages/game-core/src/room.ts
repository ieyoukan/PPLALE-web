import type { RoomChatStampId } from './chatStamps.ts';
export { ROOM_CHAT_STAMPS } from './chatStamps.ts';
export type { RoomChatStampId } from './chatStamps.ts';
// ルームのルールと、ブラウザ・サーバー間で共有する型。
// ブラウザとルームサーバーの通信形式を定義する。
// サーバーが完全な状態を持ち、閲覧者に許可した情報だけを返す。
import type { Catalog, Command, Deck, GameState, Side } from './model.ts';
import type { CpuLevel } from './ai/types.ts';
import { defaultMatchRules, deckRuleErrors, describeMatchRules, parseMatchRules } from './rules.ts';
import type { MatchRules } from './rules.ts';
import type { PlayPerformance, PlayReport, ServerTiming } from './performance.ts';

// ルームのルール：使用できるカードと観戦の可否。
export { describeMatchRules, fruitNames, fruits, playableNow } from './rules.ts';
export type { Fruit, MatchRules } from './rules.ts';

export interface RoomRules extends MatchRules {
    /** 1ターンの秒数。省略時は無制限。開始準備は時間制限の対象外。 */
    turnSeconds?: 120 | 180 | 300;
    /** 観戦の許可。通常ルームの観戦者には両手札を見せ、対戦者には観戦人数を知らせる。 */
    spectators?: boolean;
}
export const defaultRoomRules: RoomRules = { ...defaultMatchRules, spectators: false };
/** 受信した値から有効なルールだけを取り出す。使用可能なフルーツがなければnull。 */
export function parseRoomRules(value: unknown): RoomRules | null {
    const rules = parseMatchRules(value);
    const seconds = (value as RoomRules | null)?.turnSeconds;
    return rules && { ...rules, spectators: (value as RoomRules).spectators === true,
        ...((seconds === 120 || seconds === 180 || seconds === 300) && { turnSeconds: seconds }) };
}

/** このルールでデッキを使えない理由。使用可能なら空配列。 */
export const roomDeckErrors = (deck: Deck, rules: RoomRules, catalog: Catalog): string[] => deckRuleErrors(deck, rules, catalog, 'このルーム');

/** 準備画面と共有文で使うルールの要約。 */
export const describeRoomRules = (rules: RoomRules) => `${describeMatchRules(rules)} ／ 観戦：${rules.spectators ? 'あり' : 'なし'} ／ 1ターン：${rules.turnSeconds ? `${rules.turnSeconds / 60}分` : '無制限'}`;

/** サーバーのターン時計。相手の選択待ちではdeadlineをnullにし、remainingMsを固定する。 */
export interface RoomTurnClock {
    turn: number;
    side: Side;
    remainingMs: number;
    deadline: number | null;
    /** 同じターンの時間切れ通知を重複させないための記録。 */
    expired?: true;
}

// 各席・観戦者へ返す情報。
/** lobbyは準備、playingは対戦中、finishedは対戦終了、closedはルーム閉鎖。 */
export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';

/** 相手にも公開できる操作。検証用操作は含めず、操作者は送信者の席に限定する。 */
export type RoomCommand = Exclude<Command, { type: 'adjust' | 'draw' }>;

/** 今回の盤面になった原因の操作。相手側で演出するときに使う。 */
export interface LastCommand {
    command: RoomCommand;
    /** 直前まで相手が知らなかった、使用・公開されたカード。 */
    cardId?: string;
}

/** 席または観戦者向けのルーム状態。非公開領域はviewForで隠してから送る。 */
export interface RoomView {
    turnClock?: RoomTurnClock;
    /** 送信時のサーバー時刻。ブラウザの時計に依存せず残り時間を表示する。 */
    serverNow?: number;
    id: string;
    mode?: 'free';
    /** ルーム変更ごとに増える番号。古い通知で新しい状態を上書きしない。 */
    version: number;
    /** この表示の対象席。観戦者は手前側として0を使う。 */
    seat: Side;
    /** 観戦者の表示は操作不可。旧フリーマッチの対戦中は両者の手札を隠す。 */
    watching?: true;
    /** サーバーがaway通知に対応している印。非対応の旧サーバーには送らない。 */
    reportsAway?: true;
    /** 現在の観戦人数。 */
    spectators: number;
    /** 対戦記録の永続化が済んだ後だけ返す。 */
    replayId?: string;
    /** 未公開手札を除いた盤面評価。対戦者・観戦者で同じ値を使う。 */
    assessment?: { win: number; method: 'public-position-value-v1' };
    status: RoomStatus;
    /** このルームの試合番号。番号が変われば別の対戦。 */
    match: number;
    /** 再接続やルームIDの再利用に影響されない、試合固有のID。 */
    matchId?: string;
    rules: RoomRules;
    /** 添字は席番号。nullは空席。旧2席ルームでは、入室前の相手席だけが空になる。 */
    players: [RoomPlayer | null, RoomPlayer | null];
    /** 集まって遊ぶルームの在室情報。旧2席ルームとフリーマッチでは省略する。 */
    plaza?: PlazaView;
    /** 本人だけに返す元のデッキ一覧。シャッフル後の山札順は含めない。 */
    ownDeck?: Deck;
    game: GameState | null;
    last: LastCommand | null;
    /** 現在の対戦で投降した席。 */
    resigned: Side | null;
}
export interface RoomPlayer {
    name: string;
    profileId?: string;
    ready: boolean;
    /** 現在サーバーへ接続しているか。 */
    online: boolean;
    /** 対戦中または終了後にルームから退出したか。 */
    left?: boolean;
    /** 自分またはCPUの選択済みデッキ名。未公開のカード内容は含めない。 */
    deck?: string;
    /** この席に座っているルームメンバー。 */
    member?: string;
    /** この席はサーバーのCPUが操作する。 */
    cpu?: CpuLevel;
}

/** 未入室者向けの情報。共有リンクの入室前表示に使う。 */
export interface RoomInfo {
    id: string;
    rules: RoomRules;
    host: string;
    hostProfileId?: string;
    hostOnline?: boolean;
    status?: RoomStatus;
    /** 対戦が始まっておらず、空席がある。 */
    open: boolean;
    /** 観戦できるルーム。 */
    spectators: boolean;
    /** 入室を許可された人へ返す、ルームの事前情報。 */
    plaza?: PlazaInfo;
}

/** 席と、その席を操作する秘密のトークン。本人のブラウザだけで保持する。 */
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
    /** 着席者がCPU戦を中断する。勝敗やリプレイを作らず、同じルームの準備へ戻る。 */
    | { action: 'abort'; match: number }
    /** 席を維持して次の対戦を準備する。旧2席ルームでもデッキ選択へ戻る。 */
    | { action: 'rematch' }
    /** ルームを退出する。対戦中なら敗北になる。 */
    | { action: 'leave' }
    // 集まって遊ぶルーム専用の操作。
    | { action: 'sit'; seat: Side }
    /** 自分の席を空けて観戦へ移る。対戦中なら敗北になる。 */
    | { action: 'stand' }
    /** 対戦前にCPUを呼ぶ・設定し直す。デッキを省略するとサーバーが用意する。 */
    | { action: 'cpu'; seat: Side; level: CpuLevel; deck?: Deck }
    | { action: 'dismissCpu' }
    /** オーナー不在のルームを引き継ぐ。 */
    | { action: 'claim' }
    /** オーナーが次の試合のルールを設定する。 */
    | { action: 'rules'; rules: RoomRules }
    /** オーナーがルーム名を変更する。作成者と公開範囲は変更しない。 */
    | { action: 'rename'; name: string }
    /** 文字または登録済みスタンプを送る。送信IDを使い、再試行しても重複させない。 */
    | ({ action: 'chat'; messageId: string } & ({ text: string; stamp?: never } | { stamp: RoomChatStampId; text?: never }))
    /** 招待リンクを更新し、古いリンクを失効させる。 */
    | { action: 'renewInvite' }
    /** フレンドからの入室リクエストへ回答する。 */
    | { action: 'answer'; profileId: string; accept: boolean };

// 2つの席と、着席せずに滞在する人を持つルーム。
/** 作成時に固定する公開範囲。publicは誰でも、friendsは作成者のフレンド、friendsPlusは作成者または在室者のフレンド。inviteはオーナー、invitePlusは在室者が招待できる。 */
export type RoomVisibility = 'public' | 'friends' | 'friendsPlus' | 'invite' | 'invitePlus';
export const roomVisibilities: readonly RoomVisibility[] = ['public', 'friends', 'friendsPlus', 'invite', 'invitePlus'];
/** 別の種類を選ぶまで、新しいルームに使う公開範囲。 */
export const DEFAULT_VISIBILITY: RoomVisibility = 'invite';
/** 旧2席ルームへの入室回答。自動で着席させず、準備画面で本人に選んでもらう。 */
export const TWO_SEAT_ROOM = 'このルームは2人用です';
export const isRoomVisibility = (value: unknown): value is RoomVisibility => roomVisibilities.includes(value as RoomVisibility);
/** フレンドから所在を確認できる公開範囲。非公開ルームは招待から入る。 */
export const listedVisibility = (visibility: RoomVisibility) => visibility === 'public' || visibility === 'friends' || visibility === 'friendsPlus';
export const invitedVisibility = (visibility: RoomVisibility) => visibility === 'invite' || visibility === 'invitePlus';
export const MAX_ROOM_NAME_LENGTH = 16;
/** 着席・観戦を含めたルームの同時在室人数。 */
export const MAX_MEMBERS = 16;
export const MAX_ROOM_CHAT_LENGTH = 300;
export const MAX_ROOM_CHAT_MESSAGES = 50;
export interface RoomChatMessage {
    id: string;
    member: string;
    name: string;
    profileId?: string;
    /** 本文。スタンプの場合は、旧クライアント向けにサーバーが決めた代替文。 */
    text: string;
    stamp?: RoomChatStampId;
    sentAt: number;
}
/** 最後の接続が切れてから、在室メンバーを保持する猶予時間（ミリ秒）。 */
export const MEMBER_GRACE = 120_000;

/** 着席・待機・観戦を含むルームのメンバー。 */
export interface PlazaMember {
    id: string;
    name: string;
    profileId?: string;
    /** 現在の接続状態。一時切断中もMEMBER_GRACEの間は在室扱いにする。 */
    online: boolean;
    seat?: Side;
}
/** 盤面以外に、在室メンバーへ返すルームの情報。 */
export interface PlazaView {
    name: string;
    visibility: RoomVisibility;
    /** ルーム作成者。退出やオーナー交代でも変更しない。 */
    creator: { name: string; profileId?: string };
    /** 現在ルールを変更できるメンバー。未引き継ぎの間はnull。 */
    owner: string | null;
    /** オーナー不在時、接続中のログイン済みメンバーをゲストより優先する。 */
    canClaimOwner?: boolean;
    /** この表示の対象メンバー。 */
    me: string;
    members: PlazaMember[];
    /** チャット対応サーバーで返す履歴。このルーム内だけに保持し、対戦記録には含めない。 */
    chat?: RoomChatMessage[];
    chatEnabled?: true;
    /** 登録済みスタンプの送信に対応するサーバー。 */
    chatStamps?: true;
    /** 対戦中に変更された、次の試合用のルール。 */
    nextRules?: RoomRules;
    /** 招待リンクの秘密。共有できるメンバーだけに返す。 */
    invite?: string;
    /** 入室リクエスト。承認できるメンバーだけに返す。 */
    requests?: { profileId: string; name: string }[];
}
/** 入室可能な人に見せる、入室前のルーム情報。 */
export interface PlazaInfo {
    name: string;
    visibility: RoomVisibility;
    creator: { name: string; profileId?: string };
    /** 着席していない人も含めた在室人数。 */
    members: number;
    /** 人間またはCPUが使っている席の数。 */
    seated: number;
}
/** ルーム作成時の名前・公開範囲。閉じたルームから戻る場合は、引き継ぎ元も指定できる。 */
export interface PlazaRequest {
    name: string;
    visibility: RoomVisibility;
    /** 閉じたルームのメンバートークン。再接続者が別々の後継ルームを作らないために使う。 */
    from?: { id: string; token: string };
}
/** 作成・入室の結果。メンバーの秘密と、最初の表示状態を返す。 */
export interface Entered {
    token: string;
    view: RoomView;
}

// 席のWebSocket接続（/rooms/{id}/socket）。
/** 最初にhelloでトークンまたは観戦を指定する。操作番号nにより、要求とresultを対応させる。 */
export type ClientMessage =
    /** 席またはルームメンバーのトークン。 */
    | { type: 'hello'; token?: string; watch?: true; chat?: true }
    | { type: 'action'; n: number; action: RoomAction }
    | { type: 'performance'; reports: PlayReport[] }
    /** 画面の表示・非表示を通知する。非表示中の手番はPushで伝える。reportsAway対応サーバーへだけ送る。 */
    | { type: 'away'; away: boolean };
/** viewは表示状態、resultは操作番号nの成否、goneはルーム・メンバーの消失。成功した操作のviewはresultより先に届く。 */
export type ServerMessage =
    | { type: 'view'; view: RoomView }
    | { type: 'chat'; id: string; version: number; messages: RoomChatMessage[] }
    | { type: 'result'; n: number; error?: string; revision?: number; timing?: ServerTiming }
    /** `closed`: a plaza closed while this member was away; they may make its successor (`PlazaRequest.from`). */
    | { type: 'gone'; error: string; closed?: true };

/** サーバーの稼働情報（GET /stats）。通信計測や障害調査で使う。 */
export interface RoomServerStats {
    /** 回答したサーバーインスタンス。 */
    version: string;
    /** そのインスタンスの起動からの秒数。 */
    uptime: number;
    /** ルームの保存先。redisは共有保存、memoryは開発用の単一プロセス保存。 */
    backend: 'redis' | 'memory';
    /** 現在稼働しているサーバーインスタンス数。 */
    pods: number;
    /** 状態ごとのルーム数。 */
    rooms: Record<RoomStatus, number>;
    /** 全インスタンスの接続数。現在ルームを開いている人の目安。 */
    connections: number;
    /** サーバーを再起動しても残る累計。 */
    total: { roomsCreated: number; matchesStarted: number; matchesFinished: number; commands: number };
    /** このPodで直近に成功した256操作の処理時間。通信の往復時間とは別。 */
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

/** 本人と承認済みフレンドへ返す現在地。非公開ルームの識別情報は返さない。 */
export type ProfileLocation = { kind: 'offline' } | { kind: 'private'; visibility: RoomVisibility } | { kind: 'room'; room: RoomInfo };
