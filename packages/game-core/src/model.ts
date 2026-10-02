export type Side = 0 | 1;
export type DeckKind = 'yojo' | 'sweet';
export type Keyword = 'charge' | 'fast' | 'taunt' | 'guard' | 'pierce' | 'immobile' | 'noEat' | 'effectImmune';
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
    firstTurnDraw: boolean;
    maxPP: number;
    stealHeals: boolean;
    emptyDeckLoses: boolean;
    guardBlocksUnits: boolean;
    pierceIgnoresTaunt: boolean;
}
// Explicit sandbox preset until the rulebook is confirmed. Stored in each match.
export const sandboxRules: Rules = {
    initialPoints: 12, initialYojo: 3, initialSweet: 0, firstPlayer: 0,
    turnDraw: 'yojo', firstTurnDraw: false, maxPP: 10, stealHeals: false,
    emptyDeckLoses: false, guardBlocksUnits: true, pierceIgnoresTaunt: true,
};
export interface Instance {
    uid: string;
    cardId: string;
    attackBonus: number;
    hpBonus: number;
    damage: number;
    costDelta: number;
    temporaryCost: number;
    keywords: Keyword[];
    shield: boolean;
    slot: number | null;
    entered: number;
    exhausted: boolean;
    ateOn: number;
    revealed: boolean;
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
    nextPpDebt: number;
    milestones: number[];
    played: string[];
    shield: boolean;
    doubleSweet: boolean;
    skills: number[];
    lastBorrow: number;
}
export interface Task {
    op: string;
    actor: Side;
    source?: string;
    target?: string;
    amount?: number;
    hp?: number;
    keyword?: Keyword;
    cardId?: string;
    scope?: 'friendly' | 'enemy' | 'any';
    ids?: string[];
    count?: number;
    multiplier?: number;
    text?: string;
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
export interface GameState {
    version: 1;
    rules: Rules;
    rng: number;
    serial: number;
    revision: number;
    active: Side;
    turn: number;
    players: [
        Player,
        Player
    ];
    cards: Record<string, Instance>;
    queue: Task[];
    pending: Choice | null;
    winner: Side | 'draw' | null;
    log: string[];
}
export type Command = {
    type: 'play';
    actor: Side;
    uid: string;
    slot?: number;
} | {
    type: 'attack';
    actor: Side;
    uid: string;
    target: string | 'leader';
} | {
    type: 'end';
    actor: Side;
} | {
    type: 'choose';
    actor: Side;
    option: string;
} | {
    type: 'skill';
    actor: Side;
    index: number;
} | {
    type: 'reveal';
    actor: Side;
    uid: string;
} | {
    type: 'adjust';
    actor: Side;
    resource: 'points' | 'pp' | 'ppBonus' | 'damage';
    delta: number;
    uid?: string;
} | {
    type: 'draw';
    actor: Side;
    deck: DeckKind;
};
export interface Result {
    state: GameState;
    error?: string;
}
export const other = (side: Side): Side => side === 0 ? 1 : 0;
export const baseKeywords: Record<string, Keyword[]> = {
    y_1: ['taunt'], y_3: ['guard'], y_4: ['charge'], y_8: ['guard'], y_13: ['fast', 'taunt'],
    y_15: ['fast'], y_16: ['guard'], y_17: ['guard', 'noEat'], y_20: ['charge'], y_21: ['charge'],
    y_23: ['guard'], y_25: ['fast', 'pierce'], y_28: ['taunt', 'effectImmune'],
    y_29: ['taunt'], token_pudding: ['taunt', 'guard', 'immobile'],
};
export const skillInfo: Record<string, {
    name: string;
    cost: number;
    uses: number;
}[]> = {
    p_0: [{ name: 'ぷぷりえの参謀', cost: 3, uses: 1 }, { name: '参謀の全面バックアップ', cost: 2, uses: 1 }],
    p_1: [{ name: 'お菓子はうぃまるが守りまｽﾔｧ', cost: 0, uses: 2 }, { name: 'うぃまるの本気を見せまｽﾔｧ', cost: 1, uses: 2 }, { name: '実は色々できまｽﾔｧ', cost: 1, uses: 1 }],
    p_2: [{ name: '後で返すからそのお菓子ちょうだい？', cost: 0, uses: 2 }],
    p_3: [{ name: '応急手当', cost: 0, uses: 2 }, { name: 'お菓子買ってきたよー', cost: 1, uses: 1 }, { name: '皆元気になあれ！', cost: 1, uses: 1 }],
    p_4: [{ name: '店長のリーダーシップなん', cost: 3, uses: 2 }, { name: 'おしおきなん！', cost: 1, uses: 1 }],
    p_5: [{ name: 'うち来ない？', cost: 4, uses: 1 }, { name: '強欲なｸﾏ', cost: 1, uses: 1 }],
};
export function skillsFor(id: string) { return [{ name: '突撃！隣のおやつタイム', cost: 0, uses: 2 }, ...(skillInfo[id] ?? [])]; }
