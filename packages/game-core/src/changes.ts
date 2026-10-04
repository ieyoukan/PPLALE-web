// What one command changed, as a flat list the UI can present (演出). Derived from the states
// before and after, so any card effect gets presented without writing presentation code for it,
// however its script changes the state. Happenings that leave no trace in the state (a die roll,
// an effect blocked by immunity) are recorded by the engine for that command and listed here too.
//
// Every field of Instance, Player and GameState is classified below: either it produces a change
// or it is not presented (with the reason). Adding a field is a type error until it is classified,
// so new state cannot silently skip presentation.
import type { DeckKind, GameState, Instance, Keyword, Player, Side } from './model.ts';
import { sides } from './model.ts';

export type Zone = DeckKind | 'hand' | 'field' | 'nap' | 'exile';
export const zones: readonly Zone[] = ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'];
export interface Place { side: Side; zone: Zone }

export type Change =
    /** A card changed zone or side. `from` null: created by an effect (token). `to` null: left the game entirely. */
    | { kind: 'move'; uid: string; cardId: string; from: Place | null; to: Place | null }
    /** A unit took damage (amount > 0). */
    | { kind: 'damage'; uid: string; amount: number }
    /** Attack / HP bonuses changed by these amounts. */
    | { kind: 'stats'; uid: string; attack: number; hp: number }
    | { kind: 'keywords'; uid: string; added: Keyword[]; removed: Keyword[] }
    /** A hand card's cost modifiers changed. */
    | { kind: 'cost'; uid: string }
    | { kind: 'reveal'; uid: string; revealed: boolean }
    /** Units now destroyed together (くっつくポッキー). */
    | { kind: 'link'; uid: string; with: string[] }
    /** A unit's one-time damage shield. */
    | { kind: 'unitShield'; uid: string; on: boolean }
    /** Sweet points changed by `amount` (negative: lost). */
    | { kind: 'points'; side: Side; amount: number }
    | { kind: 'maxPoints'; side: Side; amount: number }
    /** Spendable PP changed by `amount`. `turnStart` when it is the refill at the start of a turn. */
    | { kind: 'pp'; side: Side; amount: number; turnStart: boolean }
    /** Permanent max-PP bonus. */
    | { kind: 'maxPp'; side: Side; amount: number }
    /** PP owed to next turn (ストラ). */
    | { kind: 'ppDebt'; side: Side; amount: number }
    /** ふわふわパンケーキ protection. */
    | { kind: 'sweetShield'; side: Side; on: boolean }
    /** おいしくなる呪文 casts waiting for the next sweet. */
    | { kind: 'sweetBoost'; side: Side; amount: number }
    | { kind: 'skillUses'; side: Side; index: number; amount: number }
    /** A card rolled a die. */
    | { kind: 'roll'; side: Side; value: number; cardId?: string }
    /** Damage or destruction prevented by effect immunity. */
    | { kind: 'blocked'; uid: string; what: 'damage' | 'destroy' };
export type ChangeKind = Change['kind'];

/** How each instance field is presented: the change it produces, or null with the reason. */
export const instanceFields: Record<keyof Instance, ChangeKind | null> = {
    attackBonus: 'stats',
    hpBonus: 'stats',
    damage: 'damage',
    keywords: 'keywords',
    costDelta: 'cost',
    temporaryCost: 'cost',
    revealed: 'reveal',
    shield: 'unitShield',
    uid: null, // identity
    cardId: null, // identity
    slot: null, // set with the move onto the field
    entered: null, // bookkeeping for attack eligibility
    exhausted: null, // shown by the board (the tilted card)
    ateOn: null, // bookkeeping for りくす
    links: 'link',
};

/** How each player field is presented. The six zones produce `move`. */
export const playerFields: Record<keyof Player, ChangeKind | null> = {
    yojo: 'move', sweet: 'move', hand: 'move', field: 'move', nap: 'move', exile: 'move',
    points: 'points',
    maxPoints: 'maxPoints',
    pp: 'pp',
    ppBonus: 'maxPp',
    nextPpDebt: 'ppDebt',
    shield: 'sweetShield',
    sweetBoost: 'sweetBoost',
    skills: 'skillUses',
    name: null, // fixed
    playable: null, // fixed
    turns: null, // presented by the turn announcement
    turnPpBonus: null, // shown by the board (the white +2 marble)
    milestones: null, // shown by the board (the blue marbles); the draw itself is a move
    played: null, // history for 「既に〜をプレイしていたなら」
    lastBorrow: null, // bookkeeping for ストラ
};

/** Top-level fields: presented by the board's own screens, or per command through `roll` / `blocked`. */
export const stateFields: Record<keyof GameState, string | null> = {
    phase: 'board: dice, choice, mulligan and versus screens',
    turn: 'board: turn announcement',
    active: 'board: turn announcement',
    winner: 'board: ゲームセット and result',
    pending: 'board: the choice is shown in place',
    dice: 'board: opening dice',
    openingRemaining: 'board: glowing decks',
    mulligan: 'board: mulligan screen',
    players: 'playerFields',
    cards: 'instanceFields',
    effectRoll: 'roll',
    effectBlocks: 'blocked',
    log: 'board: history panel',
    version: null, effectTauntRules: null, turnRules: null, rules: null, rng: null, serial: null,
    revision: null, queue: null, stall: null,
};

const placeOf = (s: GameState, uid: string): Place | null => {
    for (const side of sides) {
        for (const zone of zones) if (s.players[side][zone].includes(uid)) return { side, zone };
    }
    return null;
};
const samePlace = (a: Place | null, b: Place | null) => a?.side === b?.side && a?.zone === b?.zone;

/** Everything `after` changed compared with `before`, for presentation. */
export function changesBetween(before: GameState, after: GameState): Change[] {
    const changes: Change[] = [];
    const uids = new Set([...Object.keys(before.cards), ...Object.keys(after.cards)]);
    for (const uid of Array.from(uids)) {
        const from = before.cards[uid] ? placeOf(before, uid) : null, to = after.cards[uid] ? placeOf(after, uid) : null;
        if (!samePlace(from, to)) changes.push({ kind: 'move', uid, cardId: (after.cards[uid] ?? before.cards[uid]).cardId, from, to });
        // Also for cards that moved: a unit can be buffed in the command that puts it on the field.
        // Presenters show a change only where the card is visible afterwards.
        const a = before.cards[uid], b = after.cards[uid];
        if (!a || !b) continue;
        if (b.damage > a.damage) changes.push({ kind: 'damage', uid, amount: b.damage - a.damage });
        if (b.attackBonus !== a.attackBonus || b.hpBonus !== a.hpBonus) changes.push({ kind: 'stats', uid, attack: b.attackBonus - a.attackBonus, hp: b.hpBonus - a.hpBonus });
        const added = b.keywords.filter(k => !a.keywords.includes(k)), removed = a.keywords.filter(k => !b.keywords.includes(k));
        if (added.length || removed.length) changes.push({ kind: 'keywords', uid, added, removed });
        if (b.costDelta !== a.costDelta || b.temporaryCost !== a.temporaryCost) changes.push({ kind: 'cost', uid });
        if (b.revealed !== a.revealed) changes.push({ kind: 'reveal', uid, revealed: b.revealed });
        if (b.shield !== a.shield) changes.push({ kind: 'unitShield', uid, on: b.shield });
        const linked = b.links.filter(id => !a.links.includes(id));
        if (linked.length) changes.push({ kind: 'link', uid, with: linked });
    }
    const turnStart = before.turn !== after.turn || before.phase !== after.phase;
    for (const side of sides) {
        const a = before.players[side], b = after.players[side];
        const delta = (key: 'points' | 'maxPoints' | 'pp' | 'ppBonus' | 'nextPpDebt' | 'sweetBoost') => b[key] - a[key];
        if (delta('points')) changes.push({ kind: 'points', side, amount: delta('points') });
        if (delta('maxPoints')) changes.push({ kind: 'maxPoints', side, amount: delta('maxPoints') });
        if (delta('pp')) changes.push({ kind: 'pp', side, amount: delta('pp'), turnStart });
        if (delta('ppBonus')) changes.push({ kind: 'maxPp', side, amount: delta('ppBonus') });
        if (delta('nextPpDebt')) changes.push({ kind: 'ppDebt', side, amount: delta('nextPpDebt') });
        if (b.shield !== a.shield) changes.push({ kind: 'sweetShield', side, on: b.shield });
        if (delta('sweetBoost')) changes.push({ kind: 'sweetBoost', side, amount: delta('sweetBoost') });
        b.skills.forEach((uses, index) => { if (uses !== a.skills[index]) changes.push({ kind: 'skillUses', side, index, amount: uses - (a.skills[index] ?? 0) }); });
    }
    if (after.effectRoll && after.effectRoll.revision === after.revision && after.revision !== before.revision)
        changes.push({ kind: 'roll', side: after.effectRoll.side, value: after.effectRoll.value, cardId: after.effectRoll.cardId });
    if (after.effectBlocks && after.effectBlocks.revision === after.revision && after.revision !== before.revision)
        for (const event of after.effectBlocks.events) changes.push({ kind: 'blocked', uid: event.uid, what: event.kind });
    return changes;
}
