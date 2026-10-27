import { applyCommand, buildPosition, decodePosition } from '@pplale/game-core';
import type { Command, GameState } from '@pplale/game-core';
import problems from '@/data/lethalPuzzles.json';
import { gameCatalog } from './catalog';

export const puzzleFruits = [
  { id: 'strawberry', label: 'イチゴ' },
  { id: 'grape', label: 'ぶどう' },
  { id: 'melon', label: 'メロン' },
] as const;
export const puzzleDifficulties = ['初級', '中級', '上級'] as const;

export const lethalPuzzles = problems.map(problem => {
  const position = decodePosition(problem.code);
  if (!position?.title) throw new Error(`パズルの盤面が不正です: ${problem.id}`);
  return { ...problem, title: position.title, position };
});
export type LethalPuzzle = typeof lethalPuzzles[number];
export type PuzzleStatus = 'playing' | 'cleared' | 'failed';
export interface PuzzleAttempt {
  initial: GameState;
  game: GameState;
  commands: Command[];
  history: { game: GameState; length: number }[];
  error: string;
}

export function startPuzzle(puzzle: LethalPuzzle): PuzzleAttempt {
  const game = buildPosition(puzzle.position, gameCatalog, { names: ['あなた', '相手'] });
  return { initial: game, game, commands: [], history: [], error: '' };
}

/** End-of-turn effects still count; a win after the next turn starts does not. */
export function puzzleStatus({ game, initial }: PuzzleAttempt): PuzzleStatus {
  if (game.turn !== initial.turn || game.active !== initial.active) return 'failed';
  if (game.winner === initial.active) return 'cleared';
  return game.winner === null ? 'playing' : 'failed';
}

export function playPuzzle(attempt: PuzzleAttempt, command: Command): PuzzleAttempt {
  if (puzzleStatus(attempt) !== 'playing') return attempt;
  const result = applyCommand(attempt.game, command, gameCatalog);
  if (result.error) return { ...attempt, error: result.error };
  // Opponent reactions belong to the preceding player decision, so undo never gets stuck
  // returning to an automatic response that would simply run again.
  const history = command.actor === attempt.initial.active
    ? [...attempt.history, { game: attempt.game, length: attempt.commands.length }]
    : attempt.history;
  return { ...attempt, game: result.state, commands: [...attempt.commands, command], history, error: '' };
}

export function undoPuzzle(attempt: PuzzleAttempt): PuzzleAttempt {
  const previous = attempt.history.at(-1);
  return previous ? { ...attempt, game: previous.game, commands: attempt.commands.slice(0, previous.length), history: attempt.history.slice(0, -1), error: '' } : attempt;
}

const CLEARED_KEY = 'pplale-lethal-cleared-v1';
export function readClearedPuzzles(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '[]');
    return Array.isArray(value) ? lethalPuzzles.filter(puzzle => value.includes(puzzle.id)).map(puzzle => puzzle.id) : [];
  } catch { return []; }
}

/** Returns false if browser storage is unavailable; playing itself still works. */
export function markPuzzleCleared(id: string): boolean {
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify([...new Set([...readClearedPuzzles(), id])]));
    return true;
  } catch { return false; }
}
