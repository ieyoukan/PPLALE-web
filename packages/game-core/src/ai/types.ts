import type { Catalog, GameState, Side } from '../model.ts';
import type { Move } from './moves.ts';

export type CpuLevel = 'easy' | 'normal' | 'hard';

/** What a strategy gets for one decision. */
export interface CpuDecision {
    /** The state as the CPU may know it (hidden information already re-guessed, see determinize). */
    state: GameState;
    side: Side;
    catalog: Catalog;
    /** Every legal move with its resulting state. Never empty. */
    moves: Move[];
    /** Deterministic random number in [0, size). */
    random(size: number): number;
}

/**
 * A CPU level. It only has to pick one of `moves`; legality, hidden information and turn order are
 * handled by cpuCommand. To add a level, write a file in ai/levels/ and register it in ai/index.ts.
 */
export interface CpuStrategy {
    level: CpuLevel;
    /** Shown in the match setup. */
    name: string;
    description: string;
    choose(decision: CpuDecision): Move;
}
