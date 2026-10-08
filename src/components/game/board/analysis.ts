// 「最善手を調べる」: for the side to move, whether it can win this turn (詰み) and さいきょう's best
// plan for the turn. The board was set up by the player, so the search sees every card, hidden or not.
// Runs in analysis.worker.ts, or on the main thread without workers.
import { applyCommand, legalMoves } from '@pplale/game-core';
import { createValueEvaluator, findLethal, searchTurn, valueModel } from '@pplale/game-core/ai';
import type { Command, GameState, Side } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import { describe } from './assess';

export type AnalysisRequest = { id: number; game: GameState };
export interface Analysis {
  side: Side;
  /** win: `steps` win this turn. none: no line wins this turn. unknown: too many lines to try them all. */
  lethal: { status: 'win' | 'none' | 'unknown'; steps: string[] };
  /** さいきょう's plan for the rest of this turn and the chance of winning it leads to. */
  best: { steps: string[]; win: number };
}
export type AnalysisResponse = { id: number; analysis: Analysis | null };

const evaluate = createValueEvaluator(valueModel);

/** The commands in words, each named from the position it is played in; stops where the line stops applying. */
function stepsOf(start: GameState, line: Command[]): string[] {
  const steps: string[] = [];
  let state = start;
  for (const command of line) {
    const words = describe(state, command);
    steps.push(command.actor === start.active ? words : `（${state.players[command.actor].name}）${words}`);
    const result = applyCommand(state, command, gameCatalog, true);
    if (result.error) break;
    state = result.state;
    if (state.winner !== null || command.type === 'end') break;
  }
  return steps;
}

/** Whether `line` played from `start` ends in `side`'s win. */
function wins(start: GameState, line: Command[], side: Side): boolean {
  let state = start;
  for (const command of line) {
    const result = applyCommand(state, command, gameCatalog, true);
    if (result.error) return false;
    state = result.state;
  }
  return state.winner === side;
}

/**
 * The search returns a winning line, not the shortest one: it may use a skill for nothing. Each own
 * action (with the choices it asks for) that the win does not need is left out, as a puzzle answer.
 */
function shortest(start: GameState, line: Command[], side: Side): Command[] {
  const actions: Command[][] = [];
  for (const command of line) {
    if (command.type === 'choose' && actions.length) actions.at(-1)!.push(command);
    else actions.push([command]);
  }
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i][0].actor !== side) continue;
    const without = actions.filter((_, j) => j !== i);
    if (wins(start, without.flat(), side)) actions.splice(i, 1);
  }
  return actions.flat();
}

export function analyze(game: GameState): Analysis | null {
  if (game.phase !== 'playing' || game.winner !== null) return null;
  const side = game.pending?.task.actor ?? game.active;
  // A choice the other side makes in the middle of the turn (its 10 / 5 point draw) is not a plan.
  if (side !== game.active) return null;
  const moves = legalMoves(game, side, gameCatalog);
  if (!moves.length) return null;
  const lethal = findLethal(game, side, gameCatalog, { maxNodes: 20000 });
  const decision = { state: game, side, catalog: gameCatalog, moves, random: () => 0 };
  const { line, score } = searchTurn(decision, moves[0], { evaluate, worlds: 1 });
  const win = lethal.status === 'win' ? 1 : 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, score / valueModel.scale))));
  return {
    side,
    lethal: { status: lethal.status, steps: lethal.status === 'win' ? stepsOf(game, shortest(game, lethal.line, side)) : [] },
    best: { steps: stepsOf(game, line.length ? line : [{ type: 'end', actor: side }]), win },
  };
}
