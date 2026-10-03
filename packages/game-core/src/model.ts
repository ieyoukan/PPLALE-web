// Types shared by every layer. No logic other than tiny pure helpers lives here.

export type Side = 0 | 1;
export type DeckKind = 'yojo' | 'sweet';
export type Keyword = 'charge' | 'fast' | 'taunt' | 'guard' | 'pierce' | 'immobile' | 'noEat' | 'effectImmune';
export const keywords: readonly Keyword[] = ['charge', 'fast', 'taunt', 'guard', 'pierce', 'immobile', 'noEat', 'effectImmune'];

/** Printed card data passed in from the app (no images). */
export interface Definition {
    id: string;
    name: string;
    type: 'yojo' | 'sweet' | 'playable';
    fruit: string;
    cost: number;
    attack: number;
    hp: number;
    sweetType?: string;
    role?: string;
    version?: string;
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
// Test setup values; turn flow and PP/hand limits follow the rulebook.
export const sandboxRules: Rules = {
    initialPoints: 12, initialYojo: 3, initialSweet: 0, firstPlayer: 0,
    turnDraw: 'yojo',
};

/** One physical card in a match. `uid` is unique per match, `cardId` points to the catalog. */
export interface Instance {
    uid: string;
    cardId: string;
    attackBonus: number;
    hpBonus: number;
    damage: number;
    /** Permanent cost change while in hand. */
    costDelta: number;
    /** Cost change until the owner's turn ends. */
    temporaryCost: number;
    keywords: Keyword[];
    /** うぃまるの「1度だけ受けたダメージを0にする」 */
    shield: boolean;
    slot: number | null;
    /** Game turn it entered the field. */
    entered: number;
    exhausted: boolean;
    /** Game turn it last ate sweets (for りくす). */
    ateOn: number;
    revealed: boolean;
    /** Units destroyed together with this one (くっつくポッキー). */
    links: string[];
}

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
    turns: number;
    pp: number;
    ppBonus: number;
    /** Extra spendable PP for the second player’s fifth turn only. Not a permanent max-PP buff. */
    turnPpBonus: number;
    nextPpDebt: number;
    /** Sweet-point thresholds (10, 5) whose one-time draw opportunity has already been offered. */
    milestones: number[];
    /** Card ids played from hand this game, oldest first. */
    played: string[];
    /** ふわふわパンケーキ */
    shield: boolean;
    /** Pending おいしくなる呪文 casts. The next real sweet is multiplied by 1 + this. */
    sweetBoost: number;
    /** Remaining uses per skill, indexed like `skillsFor(playable)`. */
    skills: number[];
    lastBorrow: number;
}

/**
 * Names of queued effect steps. Generic ones live in effects/ops.ts; card-specific ones are
 * declared next to their card (cards/*.ts) or skill (playables/*.ts).
 */
export type TaskOp =
    // generic, see effects/ops.ts
    | 'damage' | 'allDamage' | 'randomDamage' | 'buff' | 'allBuff' | 'keyword' | 'destroy' | 'copy' | 'stealUnit'
    | 'heal' | 'reduce' | 'steal' | 'pp' | 'summon' | 'addHand' | 'draw' | 'discard' | 'handCost' | 'enterAuras' | 'trimHand' | 'finishTurn'
    // card / skill specific
    | 'searchRole' | 'diceDiscard' | 'shurei' | 'doughnut' | 'float' | 'floatSearch' | 'pocky' | 'pockyEnemy' | 'gift'
    | 'bonusDamage' | 'punish';
/** Why a draw happens; also the tag that keeps a hand-cost change temporary. */
export type TaskTag = 'opening' | 'turn' | 'threshold' | 'temporary';

/**
 * A queued effect step. It is plain JSON so a match can be saved while an effect waits for a choice.
 * `target` is empty until the player picks; the step is then re-run with the chosen option id.
 */
export interface Task {
    op: TaskOp;
    actor: Side;
    /** Card uid that caused the step; its script receives follow-up hooks such as `onDrawn`. */
    source?: string;
    target?: string;
    amount?: number;
    hp?: number;
    keyword?: Keyword;
    cardId?: string;
    scope?: 'friendly' | 'enemy' | 'any';
    /** Ids already handled by earlier repeats of the same step. */
    ids?: string[];
    /** Fixed candidate list for multi-target steps. */
    candidates?: string[];
    count?: number;
    multiplier?: number;
    text?: TaskTag;
    deck?: DeckKind;
}
export interface Choice {
    prompt: string;
    options: {
        id: string;
        label: string;
    }[];
    task: Task;
}

export type Phase = 'dice' | 'initiative' | 'opening' | 'mulligan' | 'playing';
export interface GameState {
    version: 1;
    /** Marks saves using taunt for selected effects, guard for attacks, and mandatory steal healing. */
    effectTauntRules?: true;
    /** Marks saves using the latest turn, hand-limit and deck-exhaustion rules. */
    turnRules?: true;
    phase: Phase;
    openingRemaining: [number, number];
    mulligan: { eligible: [string[], string[]]; confirmed: [boolean, boolean] };
    dice: { rolls: [number | null, number | null]; ties: number } | null;
    rules: Rules;
    rng: number;
    serial: number;
    revision: number;
    active: Side;
    turn: number;
    players: [Player, Player];
    cards: Record<string, Instance>;
    queue: Task[];
    pending: Choice | null;
    winner: Side | 'draw' | null;
    log: string[];
    /**
     * 膠着の判定: whether the current turn had a draw / play / unit action / skill, and how many
     * turns in a row ended without one. Absent in older saves (treated as no idle turns).
     */
    stall?: { acted: boolean; idleTurns: number };
    /** Effect immunity outcomes from one command, for presentation; never changes legality. */
    effectBlocks?: { revision: number; events: { uid: string; kind: 'damage' | 'destroy' }[] };
}

export type Command =
    | { type: 'roll'; actor: Side }
    | { type: 'initiative'; actor: Side; order: 'first' | 'second' }
    | { type: 'openingDraw'; actor: Side; deck: DeckKind }
    | { type: 'mulligan'; actor: Side; replacements: { uid: string; deck: DeckKind }[] }
    | { type: 'keep'; actor: Side }
    | { type: 'play'; actor: Side; uid: string; slot?: number }
    | { type: 'attack'; actor: Side; uid: string; target: string | 'leader' }
    | { type: 'end'; actor: Side }
    | { type: 'choose'; actor: Side; option: string }
    | { type: 'skill'; actor: Side; index: number }
    | { type: 'reveal'; actor: Side; uid: string }
    // Sandbox (test) operations, accepted only with `allowAdjust`.
    | { type: 'adjust'; actor: Side; resource: 'points' | 'pp' | 'ppBonus' | 'damage'; delta: number; uid?: string }
    | { type: 'draw'; actor: Side; deck: DeckKind };
export interface Result {
    state: GameState;
    error?: string;
}

export const other = (side: Side): Side => side === 0 ? 1 : 0;
export const sides: readonly Side[] = [0, 1];
export const deckLabel = (kind: DeckKind) => kind === 'yojo' ? '幼女' : 'お菓子';
/** Thrown for an illegal command; applyCommand turns it into `Result.error` and keeps the old state. */
export class RuleError extends Error {}
