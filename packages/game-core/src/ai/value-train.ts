// Training of the learned value (ai/value.ts): sampling positions and fitting the network.
// Only computation lives here; files and worker threads belong to the callers
// (scripts/value.mjs and the CPU server).
import type { Catalog, GameState } from '../model.ts';
import { defaultWeights } from './evaluate.ts';
import { createHard } from './levels/hard.ts';
import { playMatch } from './selfplay.ts';
import type { CpuStrategy } from './types.ts';
import { valueFeatures, valueLayout, valueLogit } from './value.ts';
import type { ValueModel } from './value.ts';

const { full: FULL, inputs: INPUTS } = valueLayout;
/** Numbers per position: the features of both sides. */
export const VALUE_ROW = FULL * 2;

/**
 * A random move this often in self-play. The outcome after a bad move is what teaches the network
 * which moves matter: 0.25 gave a clearly stronger さいきょう than 0.08.
 */
const EXPLORE = 0.25;

/** Positions and the outcome of their match. `x` holds VALUE_ROW numbers per position. */
export interface ValueData {
    x: Float32Array;
    /** 1 when side 0 won the match. */
    y: Uint8Array;
    /** Match id: positions of one match stay together in the training or the validation part. */
    match: Uint32Array;
    /** Weight per position; 1 when absent. */
    weight?: Float32Array;
}

/**
 * Returns a function to call with every state of a match in order; it answers whether the state
 * begins a turn. Only those positions are trained on: that is where the search asks for a value.
 */
export function turnStarts(): (state: GameState) => boolean {
    let turn = -1;
    return state => {
        if (state.phase !== 'playing' || state.turn === turn) return false;
        turn = state.turn;
        return true;
    };
}

/** Sampled turn starts of one つよい self-play match and whether side 0 won; null without a winner. */
export function selfPlayPositions(catalog: Catalog, seed: number, share: number): { rows: Float32Array[]; won: 0 | 1 } | null {
    const hard = createHard(defaultWeights);
    const explorer: CpuStrategy = {
        ...hard,
        choose: d => d.state.phase === 'playing' && d.random(1000) < EXPLORE * 1000 ? d.moves[d.random(d.moves.length)] : hard.choose(d),
    };
    let r = Math.imul(seed, 2654435761) >>> 0;
    const chance = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    const rows: Float32Array[] = [], begins = turnStarts();
    const result = playMatch(catalog, { levels: [explorer, explorer], seed, onStep(state) {
        if (begins(state) && chance() < share) rows.push(valueFeatures(state, catalog));
    } });
    return typeof result.winner === 'number' ? { rows, won: result.winner === 0 ? 1 : 0 } : null;
}

/** Joins the positions of several matches into one data set. */
export function valueData(matches: { id: number; rows: Float32Array[]; won: 0 | 1; weight?: number }[]): ValueData {
    const count = matches.reduce((sum, m) => sum + m.rows.length, 0);
    const data = { x: new Float32Array(count * VALUE_ROW), y: new Uint8Array(count), match: new Uint32Array(count), weight: new Float32Array(count) };
    let at = 0;
    for (const m of matches) for (const row of m.rows) {
        data.x.set(row, at * VALUE_ROW);
        data.y[at] = m.won;
        data.match[at] = m.id;
        data.weight[at++] = m.weight ?? 1;
    }
    return data;
}

export interface Fit { loss: number; accuracy: number }
export interface TrainOptions {
    hidden?: number;
    epochs?: number;
    /** Called after each pass over the training positions with the validation result. */
    onEpoch?: (epoch: number, fit: Fit) => void;
}
export interface TrainResult {
    /** The model of the best epoch on the validation positions. */
    model: ValueModel;
    fit: Fit;
    /** What the hand-written evaluation alone predicts on the same validation positions. */
    baseline: Fit;
    training: number;
    validation: number;
}

/** Every tenth match is held out for validation. */
const held = (match: number) => match % 10 === 0;
const loss = (z: number) => Math.log1p(Math.exp(-Math.abs(z))) + Math.max(z, 0);

/**
 * Fits the network of ai/value.ts to who won. Deterministic for the same data. A lower validation
 * loss does not mean a stronger CPU: compare models by playing matches before adopting one.
 */
export function trainValue(data: ValueData, { hidden = 32, epochs = 4, onEpoch }: TrainOptions = {}): TrainResult {
    const { x, y, match } = data, count = y.length;
    const weight = (i: number) => data.weight?.[i] ?? 1;
    const training: number[] = [], validation: number[] = [];
    for (let i = 0; i < count; i++) (held(match[i]) ? validation : training).push(i);
    if (!training.length || !validation.length) throw new Error('not enough positions to train on');

    let random = 20261005;
    const uniform = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return (random + 0.5) / 4294967296; };
    const gaussian = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    // One flat parameter vector: first layer, hidden bias, output weights, direct weights.
    const B = INPUTS * hidden, V = B + hidden, L = V + hidden, SIZE = L + INPUTS;
    const w = new Float64Array(SIZE);
    for (let i = 0; i < B; i++) w[i] = gaussian() * 0.1;
    for (let j = 0; j < hidden; j++) w[V + j] = gaussian() * 0.1;
    const snapshot = (): ValueModel => ({
        inputs: INPUTS, hidden, first: Array.from(w.subarray(0, B)), bias: Array.from(w.subarray(B, V)),
        out: Array.from(w.subarray(V, L)), linear: Array.from(w.subarray(L)), scale: 1,
    });

    const grad = new Float64Array(SIZE), m1 = new Float64Array(SIZE), m2 = new Float64Array(SIZE);
    const act = [new Float64Array(hidden), new Float64Array(hidden)];
    let row = x.subarray(0, VALUE_ROW);
    /** Network output for one side of the current row; `own` / `foe` are offsets into it. */
    const forward = (own: number, foe: number, h: Float64Array) => {
        for (let j = 0; j < hidden; j++) h[j] = w[B + j];
        let sum = 0;
        for (let i = 0; i < INPUTS; i++) {
            const value = i < FULL ? row[own + i] : row[foe + i - FULL];
            if (!value) continue;
            sum += value * w[L + i];
            for (let j = 0, at = i * hidden; j < hidden; j++) h[j] += value * w[at + j];
        }
        for (let j = 0; j < hidden; j++) { h[j] = Math.tanh(h[j]); sum += w[V + j] * h[j]; }
        return sum;
    };
    const backward = (own: number, foe: number, h: Float64Array, delta: number) => {
        for (let j = 0; j < hidden; j++) { grad[V + j] += delta * h[j]; h[j] = delta * w[V + j] * (1 - h[j] * h[j]); grad[B + j] += h[j]; }
        for (let i = 0; i < INPUTS; i++) {
            const value = i < FULL ? row[own + i] : row[foe + i - FULL];
            if (!value) continue;
            grad[L + i] += delta * value;
            for (let j = 0, at = i * hidden; j < hidden; j++) grad[at + j] += h[j] * value;
        }
    };
    const logit = (i: number) => { row = x.subarray(i * VALUE_ROW, (i + 1) * VALUE_ROW); return forward(0, FULL, act[0]) - forward(FULL, 0, act[1]); };
    const fitOf = (score: (i: number) => number): Fit => {
        let total = 0, correct = 0;
        for (const i of validation) { const z = score(i); total += loss(z) - y[i] * z; if ((z > 0) === (y[i] === 1)) correct++; }
        return { loss: total / validation.length, accuracy: correct / validation.length };
    };

    // The hand-written evaluation alone, scaled by the best single factor: the bar to clear.
    const plan = (i: number) => x[i * VALUE_ROW + FULL - 1];
    let k = 1;
    for (let step = 0; step < 50; step++) {
        let g = 0, curve = 0;
        for (const i of training) { const p = 1 / (1 + Math.exp(-k * plan(i))); g += (p - y[i]) * plan(i); curve += p * (1 - p) * plan(i) ** 2; }
        k -= g / (curve || 1);
    }
    const baseline = fitOf(i => k * plan(i));

    const BATCH = 128, DECAY = 1e-5;
    let best: { fit: Fit; model: ValueModel } | null = null, step = 0;
    for (let epoch = 1; epoch <= epochs; epoch++) {
        for (let i = training.length - 1; i > 0; i--) { const j = Math.floor(uniform() * (i + 1)); [training[i], training[j]] = [training[j], training[i]]; }
        const rate = 2e-3 * 0.5 * (1 + Math.cos(Math.PI * (epoch - 1) / epochs));
        for (let start = 0; start < training.length; start += BATCH) {
            grad.fill(0);
            const end = Math.min(training.length, start + BATCH);
            let total = 0;
            for (let n = start; n < end; n++) total += weight(training[n]);
            for (let n = start; n < end; n++) {
                const i = training[n], delta = (1 / (1 + Math.exp(-logit(i))) - y[i]) * weight(i) / total;
                backward(0, FULL, act[0], delta);
                backward(FULL, 0, act[1], -delta);
            }
            step++;
            const fix = Math.sqrt(1 - 0.999 ** step) / (1 - 0.9 ** step);
            for (let p = 0; p < SIZE; p++) {
                const g = grad[p] + DECAY * w[p];
                m1[p] = 0.9 * m1[p] + 0.1 * g;
                m2[p] = 0.999 * m2[p] + 0.001 * g * g;
                w[p] -= rate * fix * m1[p] / (Math.sqrt(m2[p]) + 1e-8);
            }
        }
        const fit = fitOf(logit);
        onEpoch?.(epoch, fit);
        if (!best || fit.loss < best.fit.loss) best = { fit, model: snapshot() };
    }
    if (!best) throw new Error('no training epochs');
    // The search's thresholds assume the scale of the hand-written value: match its spread.
    const spread = (values: number[]) => {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    };
    const { model, fit } = best, round = (values: number[]) => values.map(value => Math.round(value * 1e4) / 1e4);
    model.scale = Math.round(spread(validation.map(i => plan(i) * 100)) / spread(validation.map(i => valueLogit(model, x.subarray(i * VALUE_ROW, (i + 1) * VALUE_ROW)))) * 100) / 100;
    model.first = round(model.first);
    model.bias = round(model.bias);
    model.out = round(model.out);
    model.linear = round(model.linear);
    return { model, fit, baseline, training: training.length, validation: validation.length };
}
