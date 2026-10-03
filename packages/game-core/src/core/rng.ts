import type { GameState } from '../model.ts';

/** Deterministic LCG stored in the state, so a seed and a command list replay the same match. */
export function random(s: GameState, size: number): number {
    s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
    return Math.floor(s.rng / 0x100000000 * Math.max(1, size));
}

export function shuffled<T>(s: GameState, items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = random(s, i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export const rollDie = (s: GameState) => random(s, 6) + 1;
