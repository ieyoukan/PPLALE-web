// 各層で共有するデータ型。処理は小さな純粋関数だけに留める。

export type Side = 0 | 1;
export type DeckKind = 'yojo' | 'sweet';
/**
 * `exileAtEnd`: 「自分のターン終了時、この幼女をこのゲームから除外する」 (リマチャン).
 * `encore`: 「攻撃終了時、お昼寝場所のメロンタイプの幼女4人を除外したならば +1/+1 し、再行動を得る」 (えーりん).
 */
export type Keyword = 'charge' | 'fast' | 'taunt' | 'guard' | 'pierce' | 'immobile' | 'noEat' | 'effectImmune' | 'destroyImmune' | 'hide' | 'evade' | 'colorOrange' | 'colorStrawberry' | 'colorGrape' | 'colorMelon' | 'exileAtEnd' | 'encore';
export const keywords: readonly Keyword[] = ['charge', 'fast', 'taunt', 'guard', 'pierce', 'immobile', 'noEat', 'effectImmune', 'destroyImmune', 'hide', 'evade', 'colorOrange', 'colorStrawberry', 'colorGrape', 'colorMelon', 'exileAtEnd', 'encore'];
export type ExSkillId = 'dice' | 'strawberryHunt' | 'healing' | 'abyss' | 'dagger' | 'alice' | 'smoke' | 'kamikakushi';
export const exSkillIds: readonly ExSkillId[] = ['dice', 'strawberryHunt', 'healing', 'abyss', 'dagger', 'alice', 'smoke', 'kamikakushi'];
export interface ExSkillState { uses: number; lastTurn?: number; usedThisTurn?: number }
/** A skill taken from the other playable (レンテ): `index` is its place in `skillsFor(playable)`. */
export interface ExtraSkill { playable: string; index: number; uses: number }

/** アプリから渡すカードの原典データ。画像は含めない。 */
export interface Definition {
    id: string;
    name: string;
    /** gimmickは、幼女でもお菓子でもない、手札から使うトークン。 */
    type: 'yojo' | 'sweet' | 'playable' | 'gimmick';
    fruit: string;
    cost: number;
    attack: number;
    hp: number;
    sweetType?: string;
    role?: string;
    version?: string;
    effect?: string;
}
export type Catalog = Record<string, Definition>;
export interface Deck {
    name: string;
    yojo: string[];
    sweet: string[];
    playable: string;
}

export interface Rules {
    initialPoints: number;
    initialYojo: number;
    initialSweet: number;
    firstPlayer: Side;
    turnDraw: DeckKind;
}
export const MAX_PP = 12;
// 初期配置の検証用設定。ターン進行・PP・手札上限はルールに従う。
export const sandboxRules: Rules = {
    initialPoints: 12, initialYojo: 3, initialSweet: 0, firstPlayer: 0,
    turnDraw: 'yojo',
};

/** 対戦中の1枚のカード。uidは対戦内の識別子、cardIdはカード定義の参照先。 */
export interface Instance {
    uid: string;
    cardId: string;
    attackBonus: number;
    hpBonus: number;
    damage: number;
    /** 手札にある間、継続するコスト補正。 */
    costDelta: number;
    /** 持ち主のターン終了までのコスト補正。 */
    temporaryCost: number;
    keywords: Keyword[];
    /** うぃまるの「1度だけ受けたダメージを0にする」 */
    shield: boolean;
    slot: number | null;
    /** 場に出たターンの内部番号。 */
    entered: number;
    exhausted: boolean;
    /** Game turn it last ate sweets (for りくす). */
    ateOn: number;
    revealed: boolean;
    /** Units destroyed together with this one (くっつくポッキー). */
    links: string[];
    fruitTypes?: string[];
    evasion?: number;
    hiding?: boolean;
    silenced?: boolean;
    destroyedBy?: string;
    /**
     * 行動不能 given for a time (ちょり): it cannot act up to the end of this game turn (`GameState.turn`).
     * Removed when that turn ends, so while it is set the unit cannot act.
     */
    immobileUntil?: number;
    /** Actions taken this turn, for units that may act more than once a turn (ふろんとさん). */
    actions?: number;
    /** ターン終了まで保持するフルーツ属性（レンス）。属性と有効な最終ターンの対応。 */
    timedFruits?: Record<string, number>;
    /** 最後に確認した領域。手札→場以外の移動では、効果による補正をリセットする。 */
    zone?: CardZone;
    /** 持ち主以外の山札へ戻す場合の返却先。すいーつあーんで渡したお菓子は渡した側へ戻る。 */
    owner?: Side;
}
export type CardZone = 'yojo' | 'sweet' | 'hand' | 'field' | 'nap' | 'exile';

export interface Player {
    name: string;
    yojo: string[];
    sweet: string[];
    hand: string[];
    field: string[];
    nap: string[];
    exile: string[];
    playable: string;
    points: number;
    maxPoints: number;
    /** この側のターン数。画面の「nターン目」と基本の最大PPに使う。 */
    turns: number;
    pp: number;
    ppBonus: number;
    /** 後攻5ターン目の現在PPへの加算。最大PPは変えない。 */
    turnPpBonus: number;
    nextPpDebt: number;
    /** 一度だけのドロー機会を案内済みのお菓子ポイント（10・5）。 */
    milestones: number[];
    /** この対戦で手札から使ったカードID。使用した順に保持する。 */
    played: string[];
    /** ふわふわパンケーキ */
    shield: boolean;
    /** 待機中のおいしくなる呪文の回数。次の実体のお菓子を「1＋この回数」倍にする。 */
    sweetBoost: number;
    /** スキルごとの残り使用回数。並びはskillsForと同じ。回数制限がないスキルは0のまま。 */
    skills: number[];
    lastBorrow: number;
    skillHistory?: number[];
    exSkills?: Partial<Record<ExSkillId, ExSkillState>>;
    ice?: number;
    acorns?: number;
    mochidaLeft?: number;
    skipDraw?: number;
    strawberryOnlyUntil?: number;
    /** MPを持つプレイアブルの現在値（しゅれい）。初期値と上限はplayableMpを参照。 */
    mp?: number;
    /** 以後この側の場に出る幼女への、対戦中持続する+N/+N補正（ビデカメ）。 */
    entryBuff?: number;
    /** この対戦で手札から直接お昼寝場所へ捨てた幼女の数（しゅみあ）。 */
    discardedYojo?: number;
    /** 相手から得たスキル（レンテ）。元のスキルに続く添字でskill操作から利用する。 */
    extraSkills?: ExtraSkill[];
    /**
     * Fruit types given 「このゲーム中」 (ソーダ) to every 幼女 in this side's field, hand, 幼女デッキ and nap:
     * also to the ones that come there later (tokens), for as long as they are there.
     */
    lastingFruits?: string[];
}

/** 待機する効果の名前。共通処理はeffects/ops.ts、個別処理は各カード・スキルの実装で定義する。 */
export type TaskOp =
    // 共通の効果。実装はeffects/ops.ts。
    | 'damage' | 'allDamage' | 'randomDamage' | 'buff' | 'allBuff' | 'keyword' | 'destroy' | 'copy' | 'stealUnit'
    | 'heal' | 'reduce' | 'steal' | 'pp' | 'summon' | 'addHand' | 'draw' | 'discard' | 'handCost' | 'enterAuras' | 'trimHand' | 'finishTurn'
    | 'immobilize' | 'skillReaction'
    // カード・スキル固有の効果。
    | 'searchRole' | 'diceDiscard' | 'shurei' | 'doughnut' | 'float' | 'floatSearch' | 'pocky' | 'pockyEnemy' | 'gift'
    | 'bonusDamage' | 'punish'
    | 'cardEffect' | 'die' | 'avoidEffect' | 'attackStart' | 'attackHooks' | 'defendHooks' | 'attackResponses' | 'combat' | 'eatResponse'
    | 'endEffects' | 'beginTurn' | 'turnDraw' | 'turnDrawResponse' | 'exile' | 'bounce'
    | 'swapStats' | 'healHooks' | 'attackEnd' | 'playResponse' | 'playedAtZero';
/** ドローの理由。手札の一時的なコスト補正の識別にも使う。 */
export type TaskTag = 'opening' | 'turn' | 'threshold' | 'acorn' | 'temporary';

/** 保存可能なJSON形式の効果手順。選択待ちではtargetを空にし、回答後に選ばれたIDを入れて再開する。 */
export interface Task {
    op: TaskOp;
    actor: Side;
    /** 効果の発生元のカードuid。ドロー後などの追加処理を元のスクリプトへ返す。 */
    source?: string;
    target?: string;
    amount?: number;
    hp?: number;
    keyword?: Keyword;
    cardId?: string;
    scope?: 'friendly' | 'enemy' | 'any';
    /** 同じ効果の繰り返しで、すでに処理した対象のID。 */
    ids?: string[];
    /** 複数対象の処理中に変えない候補一覧。 */
    candidates?: string[];
    count?: number;
    multiplier?: number;
    text?: TaskTag;
    deck?: DeckKind;
    step?: string;
    value?: number;
    subject?: string;
    selected?: boolean;
    checked?: boolean;
    ignoreAvoidance?: boolean;
    blockedTarget?: string;
    resume?: Task;
}
export interface Choice {
    prompt: string;
    options: {
        id: string;
        label: string;
    }[];
    task: Task;
}

/**
 * How a match was decided.
 * points: the loser's お菓子ポイント reached 0. stall: no actions for too long, judged on points.
 * special: a card's 特殊勝利条件 (ぶどうのいろは, ちむどんどん！). defeat: a card's 敗北条件 (メロンのもなか).
 * resign: the loser gave up (rooms).
 */
export type WinReason = 'points' | 'stall' | 'special' | 'defeat' | 'resign';
export type Phase = 'dice' | 'initiative' | 'opening' | 'mulligan' | 'playing';
export interface GameState {
    version: 1;
    /** 対象効果への挑発・攻撃へのかばう・奪取時の回復について、新しい裁定を使う保存形式。 */
    effectTauntRules?: true;
    /** 最新のターン進行・手札上限・山札切れの裁定を使う保存形式。 */
    turnRules?: true;
    /** 開始時のダイスを引き分けなしにする。省略した旧リプレイは当時の乱数を使う。 */
    decisiveOpeningDice?: true;
    phase: Phase;
    openingRemaining: [number, number];
    mulligan: { eligible: [string[], string[]]; confirmed: [boolean, boolean] };
    dice: { rolls: [number | null, number | null]; ties: number } | null;
    rules: Rules;
    rng: number;
    serial: number;
    revision: number;
    active: Side;
    /** 両者のターンごとに進む内部番号。画面にはこの値ではなくturnOfまたはmatchTurnsを使う。 */
    turn: number;
    players: [Player, Player];
    cards: Record<string, Instance>;
    queue: Task[];
    pending: Choice | null;
    winner: Side | 'draw' | null;
    /** 勝者と同時に設定する決着理由。古い保存データでは省略される。 */
    winReason?: WinReason;
    log: string[];
    /**
     * 膠着の判定: whether the current turn had a draw / play / unit action / skill, and how many
     * turns in a row ended without one. Absent in older saves (treated as no idle turns).
     */
    stall?: { acted: boolean; idleTurns: number };
    /** 1操作で発生した効果無効の表示情報。操作の合法判定には使わない。 */
    effectBlocks?: { revision: number; events: { uid: string; kind: 'damage' | 'destroy' }[] };
    /** カード効果で振った1操作分のダイス。演出用（ぎってぃ）。 */
    effectRoll?: { revision: number; side: Side; value: number; cardId?: string };
}

export type Command =
    | { type: 'roll'; actor: Side }
    | { type: 'initiative'; actor: Side; order: 'first' | 'second' }
    | { type: 'openingDraw'; actor: Side; deck: DeckKind }
    | { type: 'mulligan'; actor: Side; uids: string[] }
    | { type: 'keep'; actor: Side }
    | { type: 'play'; actor: Side; uid: string; slot?: number }
    | { type: 'attack'; actor: Side; uid: string; target: string | 'leader' }
    | { type: 'end'; actor: Side }
    | { type: 'choose'; actor: Side; option: string }
    | { type: 'skill'; actor: Side; index: number }
    | { type: 'exSkill'; actor: Side; skill: ExSkillId }
    | { type: 'acorn'; actor: Side; mode: 'draw' | 'pp' }
    | { type: 'reveal'; actor: Side; uid: string }
    // 検証用操作。allowAdjustが有効な場合だけ許可する。
    | { type: 'adjust'; actor: Side; resource: 'points' | 'pp' | 'ppBonus' | 'damage'; delta: number; uid?: string }
    | { type: 'draw'; actor: Side; deck: DeckKind };
export interface Result {
    state: GameState;
    error?: string;
}

export const other = (side: Side): Side => side === 0 ? 1 : 0;
export const sides: readonly Side[] = [0, 1];
export const deckLabel = (kind: DeckKind) => kind === 'yojo' ? '幼女' : 'お菓子';
/** 不正な操作の例外。applyCommandがResult.errorへ変換し、変更前の状態を維持する。 */
export class RuleError extends Error {}

type TurnCounts = Pick<GameState, 'active' | 'rules'> & { players: readonly Pick<Player, 'turns'>[] };
/** 画面に表示する現在の先攻・後攻と、その側のターン数。 */
export const turnOf = (s: TurnCounts): { order: 'first' | 'second'; number: number } =>
    ({ order: s.active === s.rules.firstPlayer ? 'first' : 'second', number: s.players[s.active].turns });
/** 先攻側のターン数を基準にした対戦の長さ。後攻側は同じか1少ない。 */
export const matchTurns = (s: Pick<TurnCounts, 'players'>): number => Math.max(...s.players.map(p => p.turns));
