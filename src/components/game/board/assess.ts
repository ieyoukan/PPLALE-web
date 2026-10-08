// The course of a match (形勢): each position's chance of winning and a grade for each move,
// computed one position at a time in a worker (assess.worker.ts) or, without one, on the main thread.
import { applyCommand, turnOf } from '@pplale/game-core';
import { createValueEvaluator, gradeOf, moveLoss, valueModel, winProbability } from '@pplale/game-core/ai';
import type { Command, GameState, Side } from '@pplale/game-core';
import type { MoveGrade } from '@pplale/game-core/ai';
import { gameCatalog } from '@/lib/game/catalog';

/** The position after `index` commands of the match. */
export interface AssessedPoint {
  index: number;
  /** Side 0's chance of winning, 0–1. */
  win: number;
  turn: { order: 'first' | 'second'; number: number };
  /** The command that led here, in words, its grade and how much of its player's chance it cost. */
  command?: Command;
  /** The turn the command was played in (`turn` is already the next one after ending a turn). */
  playedIn?: AssessedPoint['turn'];
  label?: string;
  grade?: MoveGrade;
  loss?: number;
}
export type AssessRequest = { id: number; initial: GameState; commands: Command[]; viewer: Side };
export type AssessResponse = { id: number; point: AssessedPoint } | { id: number; done: true };

const evaluate = createValueEvaluator(valueModel);
const SEEDS = [1, 2, 3];

/** A command in a few words, named from the position it was played in. */
export function describe(state: GameState, command: Command): string {
  const name = (uid: string) => gameCatalog[state.cards[uid]?.cardId]?.name ?? 'カード';
  switch (command.type) {
    case 'play': return `「${name(command.uid)}」を出す`;
    case 'attack': return `「${name(command.uid)}」で${command.target === 'leader' ? 'お菓子を食べる' : `「${name(command.target)}」を攻撃`}`;
    case 'skill': return 'スキルを使う';
    case 'reveal': return `「${name(command.uid)}」を公開`;
    case 'end': return 'ターン終了';
    case 'choose': return state.cards[command.option] ? `「${name(command.option)}」を選ぶ` : state.pending?.options.find(o => o.id === command.option)?.label ?? '選ぶ';
    default: return '操作';
  }
}

/**
 * Walks the match and yields every playing position not assessed yet. A position is judged with
 * `viewer`'s knowledge only: the opponent's hand and the deck order stay guessed.
 */
export function* assessMatch({ initial, commands, viewer }: Omit<AssessRequest, 'id'>, known: Map<number, AssessedPoint>): Generator<AssessedPoint> {
  let state = initial, previous: { state: GameState } | null = null;
  for (let index = 0; index <= commands.length; index++) {
    if (index > 0) {
      const result = applyCommand(state, commands[index - 1], gameCatalog, true);
      if (result.error) return;
      state = result.state;
    }
    if (state.phase !== 'playing') { previous = null; continue; }
    let point = known.get(index);
    if (!point) {
      // The guessed hidden cards move a single judgement by a few points: average several guesses.
      const win = SEEDS.reduce((sum, seed) => sum + winProbability(state, gameCatalog, evaluate, valueModel.scale, { viewer, seed }), 0) / SEEDS.length;
      point = { index, win, turn: turnOf(state) };
      const command = commands[index - 1];
      if (previous && command) {
        // Judged from the position it was played in, against the best plan there (viewer's knowledge only).
        const loss = moveLoss(previous.state, command, gameCatalog, evaluate, valueModel.scale, { viewer, seeds: SEEDS });
        Object.assign(point, { command, playedIn: turnOf(previous.state), label: describe(previous.state, command), ...(loss !== null && { loss, grade: gradeOf(loss) }) });
      }
      known.set(index, point);
      yield point;
    }
    previous = { state };
  }
}
