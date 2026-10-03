// A board score from one side's point of view, for strategies that compare resulting states.
import { attackOf, hpOf, maxPp } from '../core/cards.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';

export const WIN = 1_000_000;

/**
 * Weights of `evaluate`. The values are trained by self-play (`npm run cpu:train`); a strategy can
 * pass its own to play a different style.
 */
export interface Weights {
    /** Per sweet point. Fixed at 10 as the unit the other weights are relative to. */
    points: number;
    unitAttack: number;
    unitHp: number;
    /** Taunt / guard protect the sweets. */
    defender: number;
    hand: number;
    maxPp: number;
    /** Per unit on the field, beyond its stats. */
    unit: number;
    /** Extra per sweet point missing below DANGER_POINTS: losing the last points hurts more. */
    danger: number;
    /** A unit that ignores guards when attacking the sweets. */
    pierce: number;
    /** A unit that can attack right away (fast / charge). */
    quick: number;
    /** Per remaining skill use. */
    skill: number;
}
export const DANGER_POINTS = 5;
export const defaultWeights: Weights = { points: 10, unitAttack: 4.6, unitHp: 3.14, defender: 3.7, hand: 2.15, maxPp: 0.64, unit: 0, danger: 0, pierce: 0, quick: 0, skill: 0 };

function sideScore(s: GameState, side: Side, catalog: Catalog, w: Weights) {
    const p = s.players[side];
    let score = p.points * w.points + p.hand.length * w.hand + maxPp(s, side) * w.maxPp
        - Math.max(0, DANGER_POINTS - p.points) * w.danger
        + p.skills.reduce((sum, uses) => sum + uses, 0) * w.skill;
    // Breaking a one-use barrier is progress even when no points / HP are lost yet.
    if (p.shield) score += w.points;
    for (const uid of p.field) {
        const c = s.cards[uid];
        score += w.unit + attackOf(c, catalog) * w.unitAttack + Math.max(0, hpOf(c, catalog)) * w.unitHp;
        if (c.shield) score += w.unitHp;
        if (c.keywords.includes('taunt') || c.keywords.includes('guard')) score += w.defender;
        if (c.keywords.includes('pierce')) score += w.pierce;
        if (c.keywords.includes('fast') || c.keywords.includes('charge')) score += w.quick;
    }
    return score;
}

/** Higher is better for `side`. A finished match is ±WIN. */
export function evaluate(s: GameState, side: Side, catalog: Catalog, weights: Weights = defaultWeights): number {
    if (s.winner === side) return WIN;
    if (s.winner === other(side)) return -WIN;
    return sideScore(s, side, catalog, weights) - sideScore(s, other(side), catalog, weights);
}
