import { other } from '@pplale/game-core';
import type { GameState, Side } from '@pplale/game-core';
import type { Board } from '../board/useBoard';

export interface Outcome {
  winner: Side;
  /** `neutral`: nobody at this screen won or lost (both sides on one device, watching two CPUs, or watching a room). */
  kind: 'win' | 'lose' | 'neutral';
  text: string;
}

/**
 * The side that won, or null while the match is going. A match always has a winner; a save from
 * when simultaneous defeat was recorded as a draw goes to the second player, like the rule now does.
 */
export const winnerOf = (game: GameState): Side | null => game.winner === 'draw' ? other(game.rules.firstPlayer) : game.winner;

/** How the finished match reads for the viewer, or null while it is still going. */
export function outcomeOf({ game, view, mode, names, remote }: Pick<Board, 'game' | 'view' | 'mode' | 'names' | 'remote'>): Outcome | null {
  const winner = winnerOf(game);
  if (winner === null) return null;
  const text = `${names[winner]}の勝ち`;
  if (mode !== 'cpu' && mode !== 'room' || remote?.watching) return { winner, kind: 'neutral', text };
  return winner === view ? { winner, kind: 'win', text: '勝利!!' } : { winner, kind: 'lose', text };
}
