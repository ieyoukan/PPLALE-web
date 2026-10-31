// 対戦途中の保存形式をここに集約する。準備画面が書き込み、盤面が読み込んで更新する。
import { parseMatchRules, turnOf } from '@pplale/game-core';
import type { Command, CpuLevel, Deck, GameState, MatchRules, Position, Rules, Side } from '@pplale/game-core';

/**
 * cpu: you (side 0) vs CPU. hotseat: one device controls both sides. watch: CPU vs CPU.
 * room: another player over the network; the match lives on the server, not in this browser.
 * puzzle: a single-turn challenge; only opponent reactions are automated, and its session is separate.
 */
export type Mode = 'cpu' | 'hotseat' | 'watch' | 'room' | 'puzzle';
/** CPU level per side; a side's entry is unused while a human controls it. */
export type Levels = [CpuLevel, CpuLevel];
/** What the match was made from, so the same one can be started again. */
export interface MatchSetup {
  decks: [Deck, Deck];
  rules: Rules;
  /** Which cards the decks may use, as chosen on the preparation page. Saves from before it could be chosen have none. */
  matchRules?: MatchRules;
}
export interface StoredSession {
  game: GameState;
  mode: Mode;
  levels: Levels;
  setup?: MatchSetup;
  /** The match before its first command and every command since: together they replay it. */
  initial?: GameState;
  commands?: Command[];
  /** The shuffle seed `initial` was made from: with the decks it rebuilds the match anywhere. */
  seed?: number;
  /** The finished match was already sent to the CPU server. */
  reported?: boolean;
  /** The board made in the editor that the match started from (instead of decks and a shuffle). */
  position?: Position;
  /** The board is being edited (盤面エディタ), not played. */
  editing?: true;
}

const STORAGE_KEY = 'pplale-game-session-v2';
/** Where the game opens and returns to: the room this player is in (made on opening, if there is none). */
export const HOME_PATH = '/game/';
/** Preparing a match against the CPU in this browser (CPU対決). */
export const CPU_PATH = '/game/cpu/';
/** Free matches and the match history. */
export const BATTLE_PATH = '/game/battle/';
/** One room: waiting, watching and its matches are all this page, and it is the link that is shared. */
export const ROOM_PATH = '/game/room/';
export const roomHref = (id: string) => `${ROOM_PATH}${id}/`;
/** A free match's board for someone watching it. */
export const watchHref = (id: string) => `${ROOM_PATH}${id}/?watch=1`;
export const CARDS_PATH = '/game/cards/';
export const NOTIFICATIONS_PATH = '/game/notifications/';
export const SETTINGS_PATH = '/game/settings/';
/** 盤面エディタ: place cards freely, then play from there. */
export const EDITOR_PATH = '/game/editor/';
export const DECKS_PATH = '/game/decks/';
export const PUZZLES_PATH = '/game/puzzles/';
export const puzzleListHref = (fruit: string) => `${PUZZLES_PATH}?fruit=${encodeURIComponent(fruit)}`;
export const puzzleHref = (id: string) => `/game/puzzle/?id=${encodeURIComponent(id)}`;
export const CARD_GALLERY_PATH = '/game/cards/zukan/';
export const PLAY_PATH = '/game/play/';

/** Sides the CPU plays in a mode. */
export const cpuSidesOf = (mode: Mode): Side[] => mode === 'cpu' || mode === 'puzzle' ? [1] : mode === 'watch' ? [0, 1] : [];
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

/** The rules the saved match was prepared with, to prepare the next one the same way (null without them). */
export function savedMatchRules(): MatchRules | null {
  return parseMatchRules((readSession()?.setup as Partial<MatchSetup> | undefined)?.matchRules);
}

/** A short description of the unfinished saved match (for a "continue" link), or null without one. */
export function describeSavedMatch(): string | null {
  const saved = readSession();
  const game = saved?.game as Partial<GameState> | undefined;
  if (!game || game.winner !== null || !Array.isArray(game.players)) return null;
  if (saved?.editing === true) return '盤面を編集中';
  const mode = saved?.mode === 'watch' ? 'CPU同士を観戦' : saved?.mode === 'hotseat' ? 'ふたり対戦' : 'CPUと対戦';
  if (game.phase !== 'playing' || game.active === undefined || !game.rules) return `${mode}・開始前`;
  const { order, number } = turnOf({ active: game.active, rules: game.rules, players: game.players });
  return `${mode}・${order === 'first' ? '先攻' : '後攻'}${number}ターン目`;
}
