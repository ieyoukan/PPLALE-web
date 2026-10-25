// A learned position value: a small network trained on match outcomes (scripts/value.mjs).
// It scores a state like `evaluatePlan`, so the turn search can use either.
import type { Catalog, GameState, Side } from '../model.ts';
import { MP_VALUE, WIN } from './evaluate.ts';
import { evaluatePlan, pressure } from './planning.ts';
import { legacyValueFeatures, valueLayout } from './value-features.ts';
export { valueLayout } from './value-features.ts';

const { full: FULL, public: PUBLIC } = valueLayout;

/** Scores a state for `side`; higher is better, a finished match is ±WIN. */
export type Evaluator = (s: GameState, side: Side, catalog: Catalog) => number;

/** Compatibility adapter for existing models; heuristic features are deliberately legacy-only. */
export function valueFeatures(s: GameState, catalog: Catalog): Float32Array {
    return legacyValueFeatures(s, catalog, {
        plan: evaluatePlan(s, 0, catalog), pressure: [pressure(s, 0, catalog), pressure(s, 1, catalog)],
    });
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
        // MP is not among the features the model was trained on; it is added at its hand-set value.
        const value = valueLogit(m, valueFeatures(s, catalog), hidden) * m.scale + ((s.players[0].mp ?? 0) - (s.players[1].mp ?? 0)) * MP_VALUE;
        return side === 0 ? value : -value;
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
