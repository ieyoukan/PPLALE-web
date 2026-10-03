// The match in progress, kept in this browser. The preparation page writes it, the board reads
// and updates it; both go through here so the format lives in one place.
import type { CpuLevel, GameState } from '@pplale/game-core';

/** cpu: you (side 0) vs CPU. hotseat: one device controls both sides. watch: CPU vs CPU. */
export type Mode = 'cpu' | 'hotseat' | 'watch';
/** CPU level per side; a side's entry is unused while a human controls it. */
export type Levels = [CpuLevel, CpuLevel];
export interface StoredSession {
  game: GameState;
  mode: Mode;
  levels: Levels;
}

const STORAGE_KEY = 'pplale-game-session-v2';
export const LOBBY_PATH = '/game/';
export const PLAY_PATH = '/game/play/';

export function saveSession(session: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/** The raw saved value (not yet validated by restoreGame), or null. */
export function readSession(): { game?: unknown; mode?: unknown; levels?: unknown; level?: unknown } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
