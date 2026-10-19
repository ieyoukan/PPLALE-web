// The value of a single move (DouZero's idea): how likely its player is to win the match after
// playing it here, judged from the position, what the move changes and what it is (which card,
// which target). Trained on self-play outcomes (scripts/policy.mjs); the turn search uses it to
// decide which moves to read first.
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { other } from '../model.ts';
import { attackOf, hpOf } from '../core/cards.ts';
import type { Move } from './moves.ts';
import { valueFeatures, valueLayout } from './value.ts';

const { full: FULL, public: PUBLIC } = valueLayout;
/** The position from the mover's side: its own features, then the public ones of the other. */
const STATE = FULL + PUBLIC;
const TYPES = ['play', 'attack', 'skill', 'choose', 'end', 'reveal'] as const;
const SKILLS = 10;

/** Trained by scripts/policy.mjs. `first` is input-major like ValueModel; `cards` names the card inputs. */
export interface PolicyModel {
    cards: string[];
    inputs: number;
    hidden: number;
    first: number[];
    bias: number[];
    out: number[];
    linear: number[];
    outBias: number;
}

/** Where each group of inputs starts, for a list of cards. */
export function policyLayout(cards: readonly string[]) {
    const n = cards.length;
    const at = { state: 0, delta: STATE, type: 2 * STATE, card: 2 * STATE + TYPES.length };
    const chosen = at.card + n, target = chosen + n, skill = target + 3, option = skill + SKILLS;
    return { ...at, chosen, target, skill, option, inputs: option + 3 };
}

/** The cards a model names: every 幼女 and お菓子 that can be in a deck, in id order. */
export function policyCards(catalog: Catalog): string[] {
    const number = (id: string) => Number(id.slice(2));
    return Object.keys(catalog).filter(id => /^[sy]_\d+$/.test(id)).sort((a, b) => a[0].localeCompare(b[0]) || number(a) - number(b));
}

/** One side's view of valueFeatures: its own features, then the other's public ones. */
function view(features: Float32Array, side: Side, out: Float32Array, offset: number, sign = 1) {
    const own = side * FULL, foe = other(side) * FULL;
    for (let i = 0; i < FULL; i++) out[offset + i] += sign * features[own + i];
    for (let i = 0; i < PUBLIC; i++) out[offset + FULL + i] += sign * features[foe + i];
}

/**
 * Inputs for playing `move` from `state` (`before` is valueFeatures(state), shared by every move
 * from it). Sparse: most inputs are 0.
 */
export function policyInputs(state: GameState, move: Move, before: Float32Array, catalog: Catalog, cards: readonly string[], index: Map<string, number>): Float32Array {
    const layout = policyLayout(cards), x = new Float32Array(layout.inputs), c: Command = move.command, side = c.actor;
    view(before, side, x, layout.state);
    view(valueFeatures(move.next, catalog), side, x, layout.delta);
    view(before, side, x, layout.delta, -1);
    x[layout.type + TYPES.indexOf(c.type as typeof TYPES[number])] = 1;
    const card = (uid: string, at: number) => {
        const i = index.get(state.cards[uid]?.cardId ?? '');
        if (i !== undefined) x[at + i] = 1;
    };
    if (c.type === 'play' || c.type === 'attack' || c.type === 'reveal') card(c.uid, layout.card);
    if (c.type === 'attack') {
        if (c.target === 'leader') x[layout.target] = 1;
        else if (state.cards[c.target]) {
            x[layout.target + 1] = attackOf(state.cards[c.target], catalog) / 10;
            x[layout.target + 2] = Math.max(0, hpOf(state.cards[c.target], catalog)) / 10;
        }
    }
    if (c.type === 'skill') x[layout.skill + Math.min(SKILLS - 1, c.index)] = 1;
    if (c.type === 'choose') {
        if (state.cards[c.option]) card(c.option, layout.chosen);
        else x[layout.option + (c.option === 'yojo' ? 0 : c.option === 'sweet' ? 1 : 2)] = 1;
    }
    return x;
}

/** Log-odds that the move's player wins, for inputs from policyInputs. */
export function policyLogit(m: PolicyModel, x: Float32Array, hidden = new Float64Array(m.hidden)): number {
    hidden.set(m.bias);
    let sum = m.outBias;
    for (let i = 0; i < m.inputs; i++) {
        const value = x[i];
        if (!value) continue;
        sum += value * m.linear[i];
        const row = i * m.hidden;
        for (let j = 0; j < m.hidden; j++) hidden[j] += value * m.first[row + j];
    }
    for (let j = 0; j < m.hidden; j++) sum += m.out[j] * Math.tanh(hidden[j]);
    return sum;
}

/** Scores the moves from one position (log-odds of winning for the mover), for the turn search. */
export type Policy = (state: GameState, moves: Move[]) => number[];

/** A Policy from a trained model; null when the model does not fit this build's features. */
export function createPolicy(m: PolicyModel, catalog: Catalog): Policy | null {
    if (m.inputs !== policyLayout(m.cards).inputs) return null;
    const index = new Map(m.cards.map((id, i) => [id, i])), hidden = new Float64Array(m.hidden);
    const known = new WeakMap<GameState, Float32Array>();
    return (state, moves) => {
        let before = known.get(state);
        if (!before) { before = valueFeatures(state, catalog); known.set(state, before); }
        return moves.map(move => policyLogit(m, policyInputs(state, move, before!, catalog, m.cards, index), hidden));
    };
}
