'use client';

import { createContext, useContext } from 'react';
import type { Board } from './useBoard';
import { sideLabel } from './useGameSession';

export const BoardContext = createContext<Board | null>(null);

export function useBoardContext(): Board {
  const board = useContext(BoardContext);
  if (!board) throw new Error('useBoardContext must be used inside BoardEmulator');
  return board;
}

/** Display name of a side from the viewer's perspective. */
export function sideName(board: Board, side: 0 | 1) {
  return sideLabel(board.mode, side);
}
