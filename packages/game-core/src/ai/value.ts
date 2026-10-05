// A learned position value: a small network trained on match outcomes (scripts/value.mjs).
// It scores a state like `evaluatePlan`, so the turn search can use either.
import { attackOf, costOf, hpOf, maxPp } from '../core/cards.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Keyword, Side } from '../model.ts';
import { WIN } from './evaluate.ts';
import { evaluatePlan, pressure } from './planning.ts';

/** Scores a state for `side`; higher is better, a finished match is ±WIN. */
export type Evaluator = (s: GameState, side: Side, catalog: Catalog) => number;

/**
 * One side's features: what both players can see, then what only the owner knows (its hand).
 * Deliberately no card names: with them the network predicted winners better (it learned which
 * decks are strong) but chose worse moves, because holding a strong card looked better than playing it.
 */
const PUBLIC = 36, FULL = PUBLIC + 3;
/** `full`: features per side. `inputs`: a side's own features followed by the public ones of the other. */
export const valueLayout = { full: FULL, public: PUBLIC, inputs: FULL + PUBLIC } as const;

/** Features of `side`. `plan` is `evaluatePlan(s, side)`, passed in because both sides share it. */
function sideFeatures(s: GameState, side: Side, catalog: Catalog, plan: number, f: Float32Array) {
    const p = s.players[side], foe = s.players[other(side)], active = s.active === side;
    const kind = (uid: string) => catalog[s.cards[uid].cardId].type;
    const damage = pressure(s, side, catalog), pp = maxPp(s, side);
    f[0] = p.points / 12;
    f[1] = Math.max(0, 5 - p.points) / 5;
    f[2] = p.points <= 2 ? 1 : 0;
    f[3] = (p.maxPoints - p.points) / 12;
    f[4] = p.shield ? 1 : 0;
    f[5] = active ? 1 : 0;
    f[6] = active ? p.pp / 12 : 0;
    f[7] = pp / 12;
    f[8] = p.turns / 12;
    f[9] = p.nextPpDebt / 4;
    f[10] = s.rules.firstPlayer === side ? 1 : 0;
    f[11] = p.hand.length / 10;
    f[12] = p.hand.filter(uid => kind(uid) === 'yojo').length / 10;
    f[13] = p.yojo.length / 20;
    f[14] = p.sweet.length / 10;
    f[15] = p.field.length / 5;
    for (const uid of p.field) {
        const c = s.cards[uid], attack = attackOf(c, catalog), hp = Math.max(0, hpOf(c, catalog));
        const has = (keyword: Keyword) => c.keywords.includes(keyword);
        f[16] += attack / 10;
        f[17] += hp / 10;
        f[18] = Math.max(f[18], attack / 6);
        if (has('guard')) { f[19] += 1 / 3; f[20] += hp / 10; }
        if (has('taunt')) f[21] += 1 / 3;
        if (has('pierce')) f[22] += attack / 6;
        if (!c.exhausted && !has('immobile') && (c.entered !== s.turn || has('fast'))) f[23] += attack / 10;
        if (c.exhausted) f[24] += 1 / 5;
        if (has('immobile')) f[25] += 1 / 3;
        if (has('effectImmune')) f[26] += 1 / 3;
        if (c.shield) f[27] += 1 / 3;
        if (has('fast') || has('charge')) f[28] += 1 / 3;
    }
    f[29] = p.skills.reduce((sum, uses) => sum + uses, 0) / 4;
    f[30] = p.sweetBoost / 2;
    f[31] = p.nap.length / 20;
    f[32] = damage / 12;
    f[33] = damage >= foe.points ? 1 : 0;
    f[34] = s.pending?.task.actor === side ? 1 : 0;
    f[35] = p.hand.filter(uid => s.cards[uid].revealed).length / 5;
    // Only the owner knows these. For the other side they come from a guessed hand (see determinize).
    const budget = active ? p.pp : Math.min(12, pp + 1);
    for (const uid of p.hand) {
        const cost = costOf(s, uid, catalog, side);
        f[PUBLIC] += cost / 30;
        if (cost <= budget) f[PUBLIC + 1] += 1 / 5;
    }
    f[PUBLIC + 2] = plan / 100;
}

/**
 * Both sides' features, side 0 first, `valueLayout.full` each. The network input for a side is its
 * own features followed by the first `valueLayout.public` features of the other side.
 */
export function valueFeatures(s: GameState, catalog: Catalog): Float32Array {
    const out = new Float32Array(FULL * 2), plan = evaluatePlan(s, 0, catalog);
    sideFeatures(s, 0, catalog, plan, out.subarray(0, FULL));
    sideFeatures(s, 1, catalog, -plan, out.subarray(FULL));
    return out;
}

/** Trained by scripts/value.mjs. `first` is input-major: `first[input * hidden + unit]`. */
export interface ValueModel {
    inputs: number;
    hidden: number;
    first: number[];
    bias: number[];
    /** Output weight per hidden unit. */
    out: number[];
    /** Direct weight per input, so the network starts from a linear model. */
    linear: number[];
    /** Multiplies the log-odds of winning into the scale of `evaluatePlan`, which the search's thresholds assume. */
    scale: number;
}

/** The network on one side's input. Both sides share it; their difference is the log-odds. */
function forward(m: ValueModel, features: Float32Array, own: number, foe: number, hidden: Float64Array): number {
    hidden.set(m.bias);
    let sum = 0;
    const feed = (value: number, input: number) => {
        if (!value) return;
        sum += value * m.linear[input];
        const row = input * m.hidden;
        for (let j = 0; j < m.hidden; j++) hidden[j] += value * m.first[row + j];
    };
    for (let i = 0; i < FULL; i++) feed(features[own + i], i);
    for (let i = 0; i < PUBLIC; i++) feed(features[foe + i], FULL + i);
    for (let j = 0; j < m.hidden; j++) sum += m.out[j] * Math.tanh(hidden[j]);
    return sum;
}

/** Log-odds that side 0 wins. Swapping the sides negates it exactly. */
export function valueLogit(m: ValueModel, features: Float32Array, hidden = new Float64Array(m.hidden)): number {
    return forward(m, features, 0, FULL, hidden) - forward(m, features, FULL, 0, hidden);
}

/** An evaluator for the turn search (`createMaster({ evaluate })`) from a trained model. */
export function createValueEvaluator(m: ValueModel): Evaluator {
    if (m.inputs !== valueLayout.inputs) throw new Error(`value model has ${m.inputs} inputs, expected ${valueLayout.inputs}`);
    const hidden = new Float64Array(m.hidden);
    return (s, side, catalog) => {
        if (s.winner === 'draw') return 0;
        if (s.winner !== null) return s.winner === side ? WIN : -WIN;
        const logit = valueLogit(m, valueFeatures(s, catalog), hidden) * m.scale;
        return side === 0 ? logit : -logit;
    };
}

/** A model from outside this build (the CPU server). Null unless it fits this build's features. */
export function parseValueModel(value: unknown): ValueModel | null {
    const m = value as Partial<ValueModel> | null;
    if (!m || typeof m !== 'object' || m.inputs !== valueLayout.inputs) return null;
    const hidden = m.hidden;
    if (typeof hidden !== 'number' || !Number.isInteger(hidden) || hidden < 1 || hidden > 256) return null;
    const numbers = (list: unknown, length: number): list is number[] =>
        Array.isArray(list) && list.length === length && list.every(n => typeof n === 'number' && Number.isFinite(n));
    if (!numbers(m.first, m.inputs * hidden) || !numbers(m.bias, hidden) || !numbers(m.out, hidden) || !numbers(m.linear, m.inputs)) return null;
    if (typeof m.scale !== 'number' || !Number.isFinite(m.scale) || m.scale <= 0) return null;
    return { inputs: m.inputs, hidden, first: m.first, bias: m.bias, out: m.out, linear: m.linear, scale: m.scale };
}
