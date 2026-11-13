'use client';

import { createContext, useContext } from 'react';
import type { Board } from './useBoard';
import { useI18n } from '@/i18n/LocaleProvider';
import { sideLabel } from './useGameSession';

export const BoardContext = createContext<Board | null>(null);

export function useBoardContext(): Board {
  const board = useContext(BoardContext);
  if (!board) throw new Error('useBoardContext must be used inside BoardEmulator');
  return board;
}

/** A player's name as shown: the default ones (あなた, 相手, CPU …) in the reader's language, chosen names as they are. */
export function usePlayerName() {
  const { t, nameText } = useI18n();
  return (name: string) => name === 'あなた' ? t(name) : nameText(name);
}

/** Display name of a side from the viewer's perspective (Japanese; shown through {@link usePlayerName}). */
export function sideName(board: Board, side: 0 | 1) {
  // In a room either seat may be this screen's; a spectator reads the players' names.
  if (board.remote?.watching) return board.names[side];
  if (board.remote) return side === board.remote.seat ? 'あなた' : '相手';
  return sideLabel(board.mode, side);
}
