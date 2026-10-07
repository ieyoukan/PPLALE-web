import { cpuProfiles } from '../profiles.ts';
// つよい: wins this turn when a short search finds a sure way; otherwise tries every legal move and
// keeps the one whose resulting board scores best.
import { defaultWeights, evaluate } from '../evaluate.ts';
import { findLethal } from '../lethal.ts';
import type { Weights } from '../evaluate.ts';
import { legalMoves } from '../moves.ts';
import type { Move } from '../moves.ts';
import type { CpuDecision, CpuStrategy } from '../types.ts';
import { normal } from './normal.ts';

/** How many of its own follow-up choices (targets etc.) are resolved before scoring a move. */
const FOLLOW_UP_DEPTH = 3;
/** Ending the turn wins ties: an action must improve the score by more than this. */
const MIN_GAIN = 0.5;

/**
 * Positions the winning-line search of つよい may examine. Most sure wins are a few commands away:
 * 20 finds nearly all that 400 does (58% against つよい without it, either way) at a tenth of the time.
 */
const LETHAL_NODES = 20;

/**
 * つよい with its own evaluation weights; training (scripts/train.mjs) compares such variants.
 * `lethalNodes` 0 leaves out the winning-line search: self-play for training stays fast, and
 * さいきょう, which runs a much larger one itself, uses that as its fallback.
 */
export const createHard = (weights: Weights, { lethalNodes = 0 }: { lethalNodes?: number } = {}): CpuStrategy => ({
    level: 'hard',
    ...cpuProfiles.hard,
    choose(d) {
        // Before the first turn there is little to compare; the rule of thumb is fine there.
        if (d.state.phase !== 'playing') return normal.choose(d);
        if (lethalNodes > 0 && d.state.active === d.side) {
            const { line } = findLethal(d.state, d.side, d.catalog, { maxNodes: lethalNodes });
            const first = line[0] && d.moves.find(m => JSON.stringify(m.command) === JSON.stringify(line[0]));
            if (first) return first;
        }
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
export const hard = createHard(defaultWeights, { lethalNodes: LETHAL_NODES });
/** つよい without the winning-line search. */
export const plainHard = createHard(defaultWeights);

/** Score of a state; if it waits for this side's own choice, assume the best answer greedily. */
function valueAfter(d: CpuDecision, state: CpuDecision['state'], depth: number, weights: Weights): number {
    if (depth > 0 && state.pending?.task.actor === d.side) {
        const follow = legalMoves(state, d.side, d.catalog);
        if (follow.length) return Math.max(...follow.map(m => valueAfter(d, m.next, depth - 1, weights)));
    }
    return evaluate(state, d.side, d.catalog, weights);
}
