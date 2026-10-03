import { cpuProfiles } from '../profiles.ts';
// つよい: tries every legal move and keeps the one whose resulting board scores best.
import { defaultWeights, evaluate } from '../evaluate.ts';
import type { Weights } from '../evaluate.ts';
import { legalMoves } from '../moves.ts';
import type { Move } from '../moves.ts';
import type { CpuDecision, CpuStrategy } from '../types.ts';
import { normal } from './normal.ts';

/** How many of its own follow-up choices (targets etc.) are resolved before scoring a move. */
const FOLLOW_UP_DEPTH = 3;
/** Ending the turn wins ties: an action must improve the score by more than this. */
const MIN_GAIN = 0.5;

/** つよい with its own evaluation weights; training (scripts/train.mjs) compares such variants. */
export const createHard = (weights: Weights): CpuStrategy => ({
    level: 'hard',
    ...cpuProfiles.hard,
    choose(d) {
        // Before the first turn there is little to compare; the rule of thumb is fine there.
        if (d.state.phase !== 'playing') return normal.choose(d);
        const value = (move: Move) => valueAfter(d, move.next, FOLLOW_UP_DEPTH, weights);
        const end = d.moves.find(m => m.command.type === 'end');
        const actions = d.moves.filter(m => m !== end);
        const best = actions.reduce<{ move?: Move; score: number }>((acc, move) => {
            const score = value(move);
            return score > acc.score ? { move, score } : acc;
        }, { score: -Infinity });
        if (!end) return best.move ?? d.moves[0];
        if (!best.move || best.score <= evaluate(d.state, d.side, d.catalog, weights) + MIN_GAIN) return end;
        return best.move;
    },
});
export const hard = createHard(defaultWeights);

/** Score of a state; if it waits for this side's own choice, assume the best answer greedily. */
function valueAfter(d: CpuDecision, state: CpuDecision['state'], depth: number, weights: Weights): number {
    if (depth > 0 && state.pending?.task.actor === d.side) {
        const follow = legalMoves(state, d.side, d.catalog);
        if (follow.length) return Math.max(...follow.map(m => valueAfter(d, m.next, depth - 1, weights)));
    }
    return evaluate(state, d.side, d.catalog, weights);
}
