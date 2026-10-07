// How likely each side is to win, and how much a move changed that: for training targets and for
// showing the course of a match (形勢) like a shogi app.
import { random } from '../core/rng.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { determinize } from './hidden.ts';
import { findLethal } from './lethal.ts';
import { plainHard } from './levels/hard.ts';
import { legalMoves } from './moves.ts';
import { searchTurn } from './turn-search.ts';
import type { Evaluator } from './value.ts';

export interface WinOptions {
    /**
     * Whose knowledge the judgement may use (determinize). Defaults to the side to move.
     * Showing the course of a match to a player must pass that player's side.
     */
    viewer?: Side;
    /** Search the real position, seeing hidden cards and the deck order: for training targets only. */
    oracle?: boolean;
    /** Seed of the guessed hidden cards. */
    seed?: number;
}

/**
 * Probability that side 0 wins, as さいきょう's search judges the position: the side to move plans
 * the rest of its turn against the opponent's best reply, and `evaluate` (scaled by `scale` to
 * log-odds, see ValueModel) scores the result. A finished match is 1 / 0.
 */
export function winProbability(state: GameState, catalog: Catalog, evaluate: Evaluator, scale: number, { viewer, oracle = false, seed = 1 }: WinOptions = {}): number {
    if (state.winner !== null) return state.winner === 0 ? 1 : state.winner === 1 ? 0 : 0.5;
    const side = state.pending?.task.actor ?? state.active;
    const known = oracle ? state : determinize(state, viewer ?? side, catalog, seed);
    if (side !== state.active) {
        // The other player has to choose in the middle of a turn (e.g. its 10 / 5 point draw): it
        // picks what is best for it, then the turn goes on.
        const answers = legalMoves(known, side, catalog).map(move => winProbability(move.next, catalog, evaluate, scale, { viewer, oracle: true, seed }));
        if (answers.length) return side === 0 ? Math.max(...answers) : Math.min(...answers);
    }
    const toSide0 = (p: number) => side === 0 ? p : 1 - p;
    if (findLethal(known, side, catalog, { maxNodes: 1000 }).status === 'win') return toSide0(1);
    const moves = legalMoves(known, side, catalog);
    if (!moves.length) return 0.5;
    const decision = { state: known, side, catalog, moves, random: (size: number) => random(known, size) };
    const { score } = searchTurn(decision, plainHard.choose(decision), { evaluate, ...(oracle && { worlds: 1 }) });
    const logit = Math.max(-20, Math.min(20, score / scale));
    return toSide0(1 / (1 + Math.exp(-logit)));
}

/** How a single move is judged by the change it made to its player's chance of winning. */
export type MoveGrade = 'blunder' | 'dubious' | null;
/** Losing this much of the chance of winning in one move marks it (悪手 / 疑問手). */
export const BLUNDER = 0.15, DUBIOUS = 0.07;

/**
 * Grades `command` from the chances before and after it (side 0's, as winProbability). Moves
 * whose result depends on luck (a draw, a die, a random target) are not graded: the drop may be
 * bad luck rather than a mistake. Forced and opening commands are not graded either.
 */
export function gradeMove(before: GameState, after: GameState, command: Command, winBefore: number, winAfter: number): { loss: number; grade: MoveGrade } {
    const actor = command.actor, mine = (p: number) => actor === 0 ? p : 1 - p;
    const loss = mine(winBefore) - mine(winAfter);
    const lucky = before.rng !== after.rng || before.players.some((p, i) => p.yojo.length !== after.players[i].yojo.length || p.sweet.length !== after.players[i].sweet.length);
    if (before.phase !== 'playing' || lucky || (before.pending && before.pending.options.length < 2)) return { loss, grade: null };
    return { loss, grade: loss >= BLUNDER ? 'blunder' : loss >= DUBIOUS ? 'dubious' : null };
}
