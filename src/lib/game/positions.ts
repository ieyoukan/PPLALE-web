// Boards made in the 盤面エディタ, kept in this browser: the one being edited, and the saved ones.
// A board is played by turning it into a match and saving that as the session the board page opens.
import { buildPosition, parsePosition } from '@pplale/game-core';
import type { Position, PositionSide } from '@pplale/game-core';
import { gameCatalog } from './catalog';
import { saveSession, sideLabel } from './sessionStore';
import type { Levels, Mode } from './sessionStore';

const DRAFT_KEY = 'pplale-editor-draft';
const SAVED_KEY = 'pplale-editor-saved';

export interface SavedPosition {
  id: string;
  savedAt: number;
  position: Position;
}

const emptySide = (playable: string): PositionSide => ({ playable, points: 12, maxPoints: 12, turns: 1, maxPp: 1, pp: 1, field: [], hand: [], nap: [], yojo: [], sweet: [] });
/** A fresh board: both sides at 12 points, 手前 to move in its first turn. */
export const emptyPosition = (): Position => ({ version: 1, active: 0, first: 0, players: [emptySide('p_0'), { ...emptySide('p_0'), turns: 0, pp: 0 }] });

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function loadDraft(): Position | null {
  return parsePosition(read(DRAFT_KEY));
}
export function saveDraft(position: Position) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(position)); } catch { /* only this page then */ }
}

export function loadSaved(): SavedPosition[] {
  const list = read(SAVED_KEY);
  if (!Array.isArray(list)) return [];
  return list.flatMap(item => {
    const position = parsePosition(item?.position);
    return position && typeof item.id === 'string' ? [{ id: item.id, savedAt: Number(item.savedAt) || 0, position }] : [];
  });
}
/** Saves under its title, replacing a saved board of the same title. Returns the new list. */
export function savePosition(position: Position): SavedPosition[] {
  const title = position.title?.trim() || '名前のない盤面';
  const list = [{ id: `${Date.now()}`, savedAt: Date.now(), position: { ...position, title } }, ...loadSaved().filter(s => (s.position.title ?? '') !== title)];
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  return list;
}
export function deleteSaved(id: string): SavedPosition[] {
  const list = loadSaved().filter(s => s.id !== id);
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* nothing kept */ }
  return list;
}

/** Makes the board the match the board page opens. Throws with the reasons when it cannot be played. */
export function startPosition(position: Position, mode: Extract<Mode, 'cpu' | 'hotseat'>, levels: Levels) {
  const game = buildPosition(position, gameCatalog, { names: [sideLabel(mode, 0), sideLabel(mode, 1)] });
  saveSession({ game, mode, levels, position, initial: game, commands: [] });
}
