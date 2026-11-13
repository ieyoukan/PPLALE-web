// The marks of the course of the match (形勢): one rule for the replay's timeline (table/ReplayBar.tsx) and 形勢の詳細
// (table/Assessment.tsx), so the two never disagree (docs/board-emulator.md).
import type { Side } from '@pplale/game-core';
import type { AssessedPoint } from './assess';

/** A change of a side's chance this large (12 points) is a swing: 好転 (up) or 悪化 (down). */
export const SWING = 0.12;
/** Judged positions at most this far apart are compared (an unfinished analysis may skip a few). */
export const SWING_GAP = 3;

/** blunder / dubious: the side's own move, graded against the best move. up / down: a swing, whoever made it. */
export type MoveMark = 'blunder' | 'dubious' | 'up' | 'down';

/** `side`'s chance at a judged position. */
export const chanceOf = (point: Pick<AssessedPoint, 'win'>, side: Side) => side === 0 ? point.win : 1 - point.win;

/** How far `side`'s chance moved from `before` to `point`, or null when they are too far apart to compare. */
export function changeBetween(before: AssessedPoint, point: AssessedPoint, side: Side): number | null {
  const gap = point.index - before.index;
  return gap >= 1 && gap <= SWING_GAP ? chanceOf(point, side) - chanceOf(before, side) : null;
}

/** up / down when the change is a swing (with a little room for floating point at exactly 12 points). */
export function swingOf(change: number | null): 'up' | 'down' | null {
  if (change === null) return null;
  return change >= SWING - 1e-9 ? 'up' : change <= -SWING + 1e-9 ? 'down' : null;
}

/** The mark of the move that led from `before` to `point`, as `side` sees it: its own grade first, then a swing. */
export function markOf(before: AssessedPoint, point: AssessedPoint, side: Side): MoveMark | null {
  if (point.command?.actor === side && point.grade) return point.grade;
  return swingOf(changeBetween(before, point, side));
}
