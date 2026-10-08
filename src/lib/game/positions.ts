// Boards made in the 盤面エディタ and saved in this browser. A board is edited on the board page itself:
// it becomes the session that page opens, in edit mode.
import { buildPosition, parsePosition } from '@pplale/game-core';
import type { Position, PositionSide } from '@pplale/game-core';
import { gameCatalog } from './catalog';
import { saveSession, sideLabel } from './sessionStore';

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

/** Makes the board the one the board page opens in edit mode. Throws when it is not a usable board. */
export function openInEditor(position: Position) {
  const game = buildPosition(position, gameCatalog, { names: [sideLabel('hotseat', 0), sideLabel('hotseat', 1)] });
  saveSession({ game, mode: 'hotseat', levels: ['master', 'master'], position, editing: true });
}
