// The course of a match (形勢): each position's chance of winning and a grade for each move,
// computed one position at a time in a worker (assess.worker.ts).
import { applyCommand, turnOf } from '@pplale/game-core';
import { createValueEvaluator, gradeOf, moveLoss, valueModel, winProbability } from '@pplale/game-core/ai';
import type { Command, GameState, Side } from '@pplale/game-core';
import type { MoveGrade } from '@pplale/game-core/ai';
import { gameCatalog } from '@/lib/game/catalog';
import type { AssessmentCache } from './assessmentCache';

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
  /** The optional, slower move analysis has finished (including moves with no grade). */
  graded?: true;
}
export type AssessRequest = { id: number; initial: GameState; current: GameState; commands: Command[]; viewer: Side; saved?: AssessmentCache };
/** The positions of a replay judged as they are (no commands replayed); `known` are points already judged. */
export type PositionsRequest = { id: number; positions: GameState[]; viewer: Side; known?: AssessedPoint[] };
export type AssessResponse = { id: number; point: AssessedPoint } | { id: number; points: AssessedPoint[] } | { id: number; done: true };

const evaluate = createValueEvaluator(valueModel);
const SEEDS = [1, 2, 3];

/**
 * Judges every playing position of a replay, coarsely spread over the match first (every 16th, 8th, …)
 * so the whole curve appears early and then fills in.
 */
export function* assessPositions({ positions, viewer }: Omit<PositionsRequest, 'id' | 'known'>, known: Map<number, AssessedPoint>): Generator<AssessedPoint> {
  for (const stride of [16, 8, 4, 2, 1]) {
    for (let index = 0; index < positions.length; index += stride) {
      const state = positions[index];
      if (known.has(index) || state.phase !== 'playing') continue;
      const win = SEEDS.reduce((sum, seed) => sum + winProbability(state, gameCatalog, evaluate, valueModel.scale, { viewer, seed }), 0) / SEEDS.length;
      const point: AssessedPoint = { index, win, turn: turnOf(state) };
      known.set(index, point);
      yield point;
    }
  }
}

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
export function* assessMatch({ initial, current, commands, viewer }: Omit<AssessRequest, 'id'>, known: Map<number, AssessedPoint>): Generator<AssessedPoint> {
  const judge = (state: GameState, index: number): AssessedPoint => {
    const win = SEEDS.reduce((sum, seed) => sum + winProbability(state, gameCatalog, evaluate, valueModel.scale, { viewer, seed }), 0) / SEEDS.length;
    return { index, win, turn: turnOf(state) };
  };
  // A resumed match may have hundreds of older positions. Show the current one before backfilling.
  if (current.phase === 'playing') {
    const latest = known.get(commands.length) ?? judge(current, commands.length);
    known.set(latest.index, latest);
    yield latest;
  }
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
      point = judge(state, index);
      known.set(index, point);
      yield point;
    }
    const command = commands[index - 1];
    if (previous && command) {
      if (!point.command) {
        point = { ...point, command, playedIn: turnOf(previous.state), label: describe(previous.state, command) };
        known.set(index, point);
        yield point;
      }
      // Grades are only displayed on the result screen. Keep their search out of live updates.
      if (current.winner !== null && !point.graded) {
        const loss = moveLoss(previous.state, command, gameCatalog, evaluate, valueModel.scale, { viewer, seeds: SEEDS });
        point = { ...point, graded: true, ...(loss !== null && { loss, grade: gradeOf(loss) }) };
        known.set(index, point);
        yield point;
      }
    }
    previous = { state };
  }
}
