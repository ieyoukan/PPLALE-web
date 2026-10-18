import type { Command, GameState, Side } from '@pplale/game-core';
import type { AssessedPoint } from './assess';

const STORAGE_KEY = 'pplale-game-assessment-v1';

/** Kept separately from the match so analysis never overwrites a newer board save. */
export interface AssessmentCache {
  version: 1;
  source: string;
  viewer: Side;
  commands: Command[];
  points: AssessedPoint[];
}

/** Retain a replay's future points, but discard the old branch after a different move. */
export function syncAssessment(cache: AssessmentCache | null, initial: GameState, viewer: Side, commands: Command[]): AssessmentCache {
  const source = JSON.stringify(initial);
  if (!cache || cache.source !== source || cache.viewer !== viewer) return { version: 1, source, viewer, commands, points: [] };
  let shared = 0;
  const length = Math.min(cache.commands.length, commands.length);
  while (shared < length && JSON.stringify(cache.commands[shared]) === JSON.stringify(commands[shared])) shared++;
  if (shared < length) return { ...cache, commands, points: cache.points.filter(point => point.index <= shared) };
  return commands.length > cache.commands.length ? { ...cache, commands } : cache;
}

export function readAssessment(): AssessmentCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as AssessmentCache;
    if (saved.version !== 1 || typeof saved.source !== 'string' || ![0, 1].includes(saved.viewer)
      || !Array.isArray(saved.commands) || !Array.isArray(saved.points)) return null;
    const points = saved.points.filter(point => point && Number.isInteger(point.index) && point.index >= 0 && point.index <= saved.commands.length
      && Number.isFinite(point.win) && point.win >= 0 && point.win <= 1
      && point.turn && ['first', 'second'].includes(point.turn.order) && Number.isInteger(point.turn.number) && point.turn.number >= 0);
    return { ...saved, points };
  } catch { return null; }
}

export function saveAssessment(cache: AssessmentCache) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* Analysis is optional; the match has its own save. */ }
}
