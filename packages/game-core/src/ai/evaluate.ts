// A board score from one side's point of view, for strategies that compare resulting states.
import { attackOf, hpOf, maxPp } from '../core/cards.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';

export const WIN = 1_000_000;

/** Weights of `evaluate`. A strategy can pass its own to play a different style. */
export interface Weights {
    points: number;
    unitAttack: number;
    unitHp: number;
    /** Taunt / guard protect the sweets. */
    defender: number;
    hand: number;
    maxPp: number;
}
export const defaultWeights: Weights = { points: 10, unitAttack: 3, unitHp: 2, defender: 4, hand: 2, maxPp: 1 };

function sideScore(s: GameState, side: Side, catalog: Catalog, w: Weights) {
    const p = s.players[side];
    let score = p.points * w.points + p.hand.length * w.hand + maxPp(s, side) * w.maxPp;
    // Breaking a one-use barrier is progress even when no points / HP are lost yet.
    if (p.shield) score += w.points;
    for (const uid of p.field) {
        const c = s.cards[uid];
        score += attackOf(c, catalog) * w.unitAttack + Math.max(0, hpOf(c, catalog)) * w.unitHp;
        if (c.shield) score += w.unitHp;
        if (c.keywords.includes('taunt') || c.keywords.includes('guard')) score += w.defender;
    }
    return score;
}

/** Higher is better for `side`. A finished match is ±WIN. */
export function evaluate(s: GameState, side: Side, catalog: Catalog, weights: Weights = defaultWeights): number {
    if (s.winner === side) return WIN;
    if (s.winner === other(side)) return -WIN;
    return sideScore(s, side, catalog, weights) - sideScore(s, other(side), catalog, weights);
}
