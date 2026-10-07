// Entry point for CPU players. A level (ai/levels/*) only picks one legal move; this file decides
// who acts, hides what the CPU cannot know, and double-checks the choice against the real state.
import { applyCommand } from '../commands/index.ts';
import { random } from '../core/rng.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { determinize } from './hidden.ts';
import { easy } from './levels/easy.ts';
import { hard } from './levels/hard.ts';
import { master } from './levels/master.ts';
import { normal } from './levels/normal.ts';
import { actingSides, legalMoves } from './moves.ts';
import type { CpuLevel, CpuStrategy } from './types.ts';

export const cpuStrategies: Record<CpuLevel, CpuStrategy> = { easy, normal, hard, master };
export { cpuLevels } from './profiles.ts';

export interface CpuOptions {
    level?: CpuLevel;
    /** A strategy to use instead of a registered level (training and experiments). */
    strategy?: CpuStrategy;
    /** The side the CPU plays. Omitted: whichever side has to act (side 1 first in the opening). */
    side?: Side;
}

/**
 * The CPU's next command, or null when the side has nothing to do now.
 * The dice phase is left to the caller, which shows the throw (the result is random anyway).
 */
export function cpuCommand(s: GameState, catalog: Catalog, { level = 'normal', side, strategy = cpuStrategies[level] }: CpuOptions = {}): Command | null {
    if (s.phase === 'dice') return null;
    const acting = actingSides(s);
    const actor = side ?? (acting.includes(1) ? 1 : acting[0]);
    if (actor === undefined || !acting.includes(actor)) return null;
    // A fixed seed per position: the same situation gives the same decision (replays, tests).
    const known = determinize(s, actor, catalog, (s.rng ^ 0x5bd1e995 ^ s.revision) >>> 0);
    const moves = legalMoves(known, actor, catalog);
    if (!moves.length) return null;
    const command = strategy.choose({ state: known, side: actor, catalog, moves, random: size => random(known, size) }).command;
    if (!applyCommand(s, command, catalog).error) return command;
    // The guessed world allowed something the real one does not; fall back to a real legal move.
    return legalMoves(s, actor, catalog)[0]?.command ?? null;
}

export { actingSides, legalMoves } from './moves.ts';
export type { Move } from './moves.ts';
export { determinize } from './hidden.ts';
export { findLethal } from './lethal.ts';
export { playMatch, randomStrawberryDeck } from './selfplay.ts';
export { createHard } from './levels/hard.ts';
export { createMaster } from './levels/master.ts';
export { searchTurn } from './turn-search.ts';
export { BLUNDER, DUBIOUS, gradeOf, moveLoss, winProbability } from './assess.ts';
export type { MoveGrade, WinOptions } from './assess.ts';
export { createValueEvaluator, parseValueModel, valueFeatures, valueLayout, valueLogit } from './value.ts';
export { valueModel } from './value-model.ts';
export type { Evaluator, ValueModel } from './value.ts';
export type { TurnSearchOptions, TurnSearchResult } from './turn-search.ts';
export type { MatchOptions, MatchResult } from './selfplay.ts';
export type { LethalOptions, LethalResult } from './lethal.ts';
export { evaluate, defaultWeights } from './evaluate.ts';
export type { Weights } from './evaluate.ts';
export type { CpuDecision, CpuLevel, CpuStrategy } from './types.ts';
