// The match in progress, kept in this browser. The preparation page writes it, the board reads
// and updates it; both go through here so the format lives in one place.
import { turnOf } from '@pplale/game-core';
import type { Command, CpuLevel, Deck, GameState, Rules, Side } from '@pplale/game-core';

/** cpu: you (side 0) vs CPU. hotseat: one device controls both sides. watch: CPU vs CPU. */
export type Mode = 'cpu' | 'hotseat' | 'watch';
/** CPU level per side; a side's entry is unused while a human controls it. */
export type Levels = [CpuLevel, CpuLevel];
/** What the match was made from, so the same one can be started again. */
export interface MatchSetup {
  decks: [Deck, Deck];
  rules: Rules;
}
export interface StoredSession {
  game: GameState;
  mode: Mode;
  levels: Levels;
  setup?: MatchSetup;
  /** The match before its first command and every command since: together they replay it. */
  initial?: GameState;
  commands?: Command[];
}

const STORAGE_KEY = 'pplale-game-session-v2';
/** Where the game opens and returns to: the CPU対決 tab (preparation against the CPU). */
export const HOME_PATH = '/game/';
/** Preparation of a match between people (same device now; rooms later). */
export const BATTLE_PATH = '/game/battle/';
export const CARDS_PATH = '/game/cards/';
export const CARD_GALLERY_PATH = '/game/cards/zukan/';
export const PLAY_PATH = '/game/play/';

/** Sides the CPU plays in a mode. */
export const cpuSidesOf = (mode: Mode): Side[] => mode === 'cpu' ? [1] : mode === 'watch' ? [0, 1] : [];
/** Display name of a side from the viewer's seat (side 0 is the near side). */
export const sideLabel = (mode: Mode, side: Side) => mode === 'watch' ? `CPU ${side + 1}` : side === 0 ? 'あなた' : mode === 'cpu' ? 'CPU' : '相手';

export function saveSession(session: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/** The raw saved value (not yet validated), or null. */
export function readSession(): { [K in keyof StoredSession]?: unknown } & { level?: unknown } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** A short description of the unfinished saved match (for a "continue" link), or null without one. */
export function describeSavedMatch(): string | null {
  const saved = readSession();
  const game = saved?.game as Partial<GameState> | undefined;
  if (!game || game.winner !== null || !Array.isArray(game.players)) return null;
  const mode = saved?.mode === 'watch' ? 'CPU同士を観戦' : saved?.mode === 'hotseat' ? 'ふたり対戦' : 'CPUと対戦';
  if (game.phase !== 'playing' || game.active === undefined || !game.rules) return `${mode}・開始前`;
  const { order, number } = turnOf({ active: game.active, rules: game.rules, players: game.players });
  return `${mode}・${order === 'first' ? '先攻' : '後攻'}${number}ターン目`;
}
