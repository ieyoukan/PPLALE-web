import type { Side } from '@pplale/game-core';
import type { AssessedPoint } from './assess';

/** Observed improvement, including luck and newly revealed information; not a move-quality grade. */
export function assessmentHighlights(points: AssessedPoint[], side: Side) {
  return points.flatMap((point, index) => {
    const before = points[index - 1];
    // Never attribute a gap in unfinished analysis, or an opponent's mistake, to this move.
    if (!before || point.index !== before.index + 1 || point.command?.actor !== side
      || !['play', 'attack', 'skill', 'reveal', 'choose'].includes(point.command.type)
      || !point.label || point.grade) return [];
    const gain = (point.win - before.win) * (side === 0 ? 1 : -1);
    // A mathematically exact 12-point gain can be slightly below .12 in floating point.
    return gain >= 0.12 - 1e-9 ? [{ point, gain }] : [];
  }).sort((a, b) => b.gain - a.gain || a.point.index - b.point.index).slice(0, 3);
}
