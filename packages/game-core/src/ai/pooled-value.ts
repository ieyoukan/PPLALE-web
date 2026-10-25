import { observeState } from '../gameplay/observation.ts';
import { researchCatalog } from '../research/cards.ts';
import { canonicalJson } from '../research/encode.ts';
import { createPoolEncoder, poolNames, poolSpec } from '../research/pooling.ts';
import type { PoolSpec } from '../research/pooling.ts';
import type { Catalog } from '../model.ts';
import { WIN } from './evaluate.ts';
import type { Evaluator } from './value.ts';

export interface PooledValueModel {
    version: 'pplale-pooled-value-v1';
    kind: 'linear' | 'mlp';
    spec: PoolSpec;
    poolHash: string;
    schemaHash: string;
    catalogHash: string;
    gameHash: string;
    inputs: number;
    hidden: number;
    mean: number[];
    scale: number[];
    valueScale: number;
    weights: { w?: number[]; b?: number; w1?: number[][]; b1?: number[]; w2?: number[]; b2?: number };
}

export function parsePooledValueModel(value: unknown): PooledValueModel {
    const m = value as PooledValueModel;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    const vector = (v: unknown, size: number): v is number[] => Array.isArray(v) && v.length === size && v.every(finite);
    if (!m || m.version !== 'pplale-pooled-value-v1' || !['linear', 'mlp'].includes(m.kind)
        || canonicalJson(m.spec) !== canonicalJson(poolSpec()) || m.inputs !== poolNames(m.spec).length
        || !vector(m.mean, m.inputs) || !vector(m.scale, m.inputs) || m.scale.some(n => n <= 0)
        || !finite(m.valueScale) || m.valueScale <= 0 || !m.weights) throw new Error('Incompatible pooled value model');
    const w = m.weights;
    if (m.kind === 'linear') {
        if (m.hidden !== 0 || !vector(w.w, m.inputs) || !finite(w.b)) throw new Error('Invalid linear model weights');
    } else if (!Number.isInteger(m.hidden) || m.hidden < 1 || m.hidden > 64 || !vector(w.b1, m.hidden)
        || !vector(w.w2, m.hidden) || !finite(w.b2) || !Array.isArray(w.w1) || w.w1.length !== m.inputs
        || !w.w1.every(row => vector(row, m.hidden))) throw new Error('Invalid neural model weights');
    return m;
}

export function pooledLogit(model: PooledValueModel, features: ArrayLike<number>): number {
    if (features.length !== model.inputs) throw new Error('Wrong pooled feature width');
    const w = model.weights;
    let value = model.kind === 'linear' ? w.b! : w.b2!;
    const hidden = model.kind === 'mlp' ? [...w.b1!] : [];
    for (let i = 0; i < model.inputs; i++) {
        const x = Math.max(-8, Math.min(8, (features[i] - model.mean[i]) / model.scale[i]));
        if (model.kind === 'linear') value += x * w.w![i];
        else for (let j = 0; j < model.hidden; j++) hidden[j] += x * w.w1![i][j];
    }
    if (model.kind === 'mlp') for (let j = 0; j < model.hidden; j++) value += Math.tanh(hidden[j]) * w.w2![j];
    if (!Number.isFinite(value)) throw new Error('Non-finite pooled model prediction');
    return value;
}

/** Experimental value estimator; same observation/pooling contract as Python training. */
export function createPooledEvaluator(raw: unknown): Evaluator {
    const model = parsePooledValueModel(raw), encoders = new WeakMap<Catalog, ReturnType<typeof createPoolEncoder>>();
    return (state, side, catalog) => {
        if (state.winner === 'draw') return 0;
        if (state.winner !== null) return state.winner === side ? WIN : -WIN;
        let encode = encoders.get(catalog);
        if (!encode) { encode = createPoolEncoder(researchCatalog(catalog), model.spec); encoders.set(catalog, encode); }
        return pooledLogit(model, encode(observeState(state, side, catalog))) * model.valueScale;
    };
}
