import type { Board } from '../board/useBoard';

export interface Outcome {
  /** `neutral`: nobody at this screen won or lost (both sides on one device, or watching two CPUs). */
  kind: 'win' | 'lose' | 'draw' | 'neutral';
  text: string;
}

/** How the finished match reads for the viewer, or null while it is still going. */
export function outcomeOf({ game, view, mode, names }: Pick<Board, 'game' | 'view' | 'mode' | 'names'>): Outcome | null {
  if (game.winner === null) return null;
  if (game.winner === 'draw') return { kind: 'draw', text: '引き分け' };
  const text = `${names[game.winner]}の勝ち`;
  if (mode !== 'cpu') return { kind: 'neutral', text };
  return game.winner === view ? { kind: 'win', text: '勝利!!' } : { kind: 'lose', text };
}
