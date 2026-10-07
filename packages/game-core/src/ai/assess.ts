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
    if (findLethal(known, side, catalog, { maxNodes: 250 }).status === 'win') return toSide0(1);
    const moves = legalMoves(known, side, catalog);
    if (!moves.length) return 0.5;
    const decision = { state: known, side, catalog, moves, random: (size: number) => random(known, size) };
    const { score } = searchTurn(decision, plainHard.choose(decision), { evaluate, ...(oracle && { worlds: 1 }) });
    const logit = Math.max(-20, Math.min(20, score / scale));
    return toSide0(1 / (1 + Math.exp(-logit)));
}

/** How a single move is judged by the chance of winning it gave away (see moveLoss). */
export type MoveGrade = 'blunder' | 'dubious' | null;
/** Giving away this much of the chance of winning in one move marks it (悪手 / 疑問手). */
export const BLUNDER = 0.15, DUBIOUS = 0.07;
export const gradeOf = (loss: number): MoveGrade => loss >= BLUNDER ? 'blunder' : loss >= DUBIOUS ? 'dubious' : null;

const sameCommand = (a: Command, b: Command) => JSON.stringify(a) === JSON.stringify(b);
/** `side`'s chance in an already guessed world where it is to move, with only `moves` as first moves. */
function bestChance(known: GameState, side: Side, moves: ReturnType<typeof legalMoves>, catalog: Catalog, evaluate: Evaluator, scale: number): number {
    const decision = { state: known, side, catalog, moves, random: (size: number) => random(known, size) };
    const { score } = searchTurn(decision, moves[0], { evaluate });
    return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, score / scale))));
}

/**
 * How much of its player's chance `command` gave away, like a shogi engine's judgement: from the
 * same position and the same guessed hidden cards, the best plan the search finds is compared with
 * the best plan that starts with `command`. Comparing within one guess (instead of judging the
 * positions before and after separately) keeps the guess from showing up as a mistake, and a draw
 * or a die is judged by what it could bring, not by what it brought. Measured on さいきょう's own
 * moves, 1% were marked (6% when judging before and after separately); random moves, 25%.
 * Null when the command is not the actor's own free decision here.
 */
export function moveLoss(state: GameState, command: Command, catalog: Catalog, evaluate: Evaluator, scale: number, { viewer, seeds = [1, 2, 3] }: { viewer?: Side; seeds?: number[] } = {}): number | null {
    const side = command.actor;
    if (state.phase !== 'playing' || state.winner !== null || (state.pending?.task.actor ?? state.active) !== side || state.active !== side) return null;
    let total = 0;
    for (const seed of seeds) {
        const known = determinize(state, viewer ?? side, catalog, seed);
        const moves = legalMoves(known, side, catalog);
        const played = moves.find(move => sameCommand(move.command, command));
        if (!played || moves.length < 2) return null;
        // findLethal also takes the opponent's forced draw in the middle of the turn (10 / 5 points).
        const wins = (s: GameState) => s.winner === side || s.winner === null && s.active === side && findLethal(s, side, catalog, { maxNodes: 250 }).status === 'win';
        const after = played.next.winner !== null ? (played.next.winner === side ? 1 : 0) : wins(played.next) ? 1 : bestChance(known, side, [played], catalog, evaluate, scale);
        const best = wins(known) ? 1 : bestChance(known, side, moves, catalog, evaluate, scale);
        total += Math.max(0, Math.max(best, after) - after);
    }
    return total / seeds.length;
}
