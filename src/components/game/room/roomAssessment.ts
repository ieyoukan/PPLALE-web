import { turnOf } from '@pplale/game-core';
import type { RoomView } from '@pplale/game-core/room';
import type { AssessedPoint } from '../board/assess';

const STORAGE_KEY = 'pplale-room-assessment-v1';
const LIMIT = 5000;

/** Only the public percentage and turn are retained; no hands, decks or commands enter this cache. */
export function appendRoomAssessment(points: AssessedPoint[], view: RoomView): AssessedPoint[] {
  const { game, assessment } = view;
  if (!game || game.phase !== 'playing' || !assessment || !Number.isFinite(assessment.win) || assessment.win < 0 || assessment.win > 1) return points;
  const point = { index: game.revision, win: assessment.win, turn: turnOf(game) };
  const last = points.at(-1);
  if (last?.index === point.index && last.win === point.win) return points;
  return [...points.filter(previous => previous.index < point.index), point].slice(-LIMIT);
}

export function readRoomAssessment(view: RoomView): AssessedPoint[] {
  let points: AssessedPoint[] = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (view.matchId && saved?.matchId === view.matchId && Array.isArray(saved.points)) {
      points = saved.points.slice(-LIMIT).flatMap((point: AssessedPoint) =>
        Number.isInteger(point?.index) && point.index >= 0 && point.index <= (view.game?.revision ?? -1)
          && Number.isFinite(point.win) && point.win >= 0 && point.win <= 1
          && point.turn && ['first', 'second'].includes(point.turn.order) && Number.isInteger(point.turn.number) && point.turn.number >= 0
          ? [{ index: point.index, win: point.win, turn: { order: point.turn.order, number: point.turn.number } }] : []);
      points = [...new Map(points.map(point => [point.index, point])).values()].sort((a, b) => a.index - b.index);
    }
  } catch { /* A disabled or damaged cache never prevents a match. */ }
  return appendRoomAssessment(points, view);
}

export function saveRoomAssessment(view: Pick<RoomView, 'matchId'>, points: AssessedPoint[]) {
  if (!view.matchId) return;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ matchId: view.matchId, points })); } catch { /* Optional history only. */ }
}
