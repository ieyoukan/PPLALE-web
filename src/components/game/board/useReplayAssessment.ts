'use client';

import { useEffect, useMemo, useState } from 'react';
import { turnOf } from '@pplale/game-core';
import type { AssessedPoint, AssessResponse, PositionsRequest } from './assess';
import { readAssessment } from './assessmentCache';
import type { ReplayTimeline } from './useGameSession';

/**
 * The course of the match (形勢) over every position of a replay, for its timeline. Positions this
 * browser already judged while the match was played (the saved assessment of the same match) are reused.
 * A room recording carries its own assessment, which is shown as recorded (docs/board-emulator.md).
 */
export function useReplayAssessment(timeline: ReplayTimeline | null, enabled: boolean): AssessedPoint[] {
  const states = timeline?.states, viewer = timeline?.viewer, recorded = timeline?.recorded;
  const stored = useMemo(() => recorded && states ? recorded.map(({ index, win }) => ({ index, win, turn: turnOf(states[index]) })) : null, [recorded, states]);
  const [result, setResult] = useState<{ states: unknown; points: AssessedPoint[] }>({ states: null, points: [] });
  useEffect(() => {
    if (!enabled || !states || viewer === undefined || recorded) return;
    const saved = readAssessment();
    const known = saved && saved.viewer === viewer && saved.source === JSON.stringify(states[0]) ? saved.points.filter(point => point.index < states.length) : [];
    const points = new Map(known.map(point => [point.index, point]));
    setResult({ states, points: [...points.values()].sort((a, b) => a.index - b.index) });
    let instance: Worker;
    try { instance = new Worker(new URL('./assess.worker.ts', import.meta.url), { type: 'module' }); } catch { return; }
    instance.addEventListener('message', (event: MessageEvent<AssessResponse>) => {
      if (!('point' in event.data)) return;
      points.set(event.data.point.index, event.data.point);
      setResult({ states, points: [...points.values()].sort((a, b) => a.index - b.index) });
    });
    instance.postMessage({ id: 1, positions: states, viewer, known } satisfies PositionsRequest);
    return () => instance.terminate();
  }, [enabled, states, viewer, recorded]);
  if (!enabled) return [];
  return stored ?? (result.states === states ? result.points : []);
}
