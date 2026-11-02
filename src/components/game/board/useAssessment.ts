'use client';

import { useEffect, useRef, useState } from 'react';
import type { Command, GameState, Side } from '@pplale/game-core';
import type { AssessedPoint, AssessRequest, AssessResponse } from './assess';
import { readAssessment, saveAssessment, syncAssessment } from './assessmentCache';
import type { AssessmentCache } from './assessmentCache';
import { takeGameWorker } from './preparedWorkers';

const SETTING_KEY = 'pplale-show-assessment';
/** The newest position is asked for once the moves settle: a turn played quickly is judged at its end, not between its animations. */
const SETTLE_MS = 300;
/** The record is written at most this often (and when the board closes or the page is left), not on every judged position. */
const SAVE_MS = 1500;

/** Whether the course of the match is shown (menu toggle, kept in this browser). */
export function useAssessmentSetting(): [boolean, (show: boolean) => void] {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    try { setShown(localStorage.getItem(SETTING_KEY) !== 'hidden'); } catch { /* the default stays */ }
  }, []);
  return [shown, show => {
    setShown(show);
    try { localStorage.setItem(SETTING_KEY, show ? 'shown' : 'hidden'); } catch { /* only this page then */ }
  }];
}

/**
 * The course of the match (形勢) from `viewer`'s knowledge: one point per playing position, filled
 * in as the match goes on (and for an earlier part of it, e.g. a resumed match, from the record).
 */
export function useAssessment({ enabled, initial, current, commands, viewer }: {
  enabled: boolean; initial: GameState | null; current: GameState; commands: Command[]; viewer: Side;
}): AssessedPoint[] {
  const worker = useRef<Worker | null>(null), request = useRef(0);
  const cache = useRef<AssessmentCache | null>(null);
  const [points, setPoints] = useState<AssessedPoint[]>([]);
  const active = enabled && !!initial;
  useEffect(() => {
    if (!active) return;
    cache.current = syncAssessment(readAssessment(), initial!, viewer, []);
    setPoints(cache.current.points);
    let saving: ReturnType<typeof setTimeout> | undefined;
    const save = () => { clearTimeout(saving); saving = undefined; if (cache.current) saveAssessment(cache.current); };
    try {
      const instance = takeGameWorker('assess');
      instance.addEventListener('message', (event: MessageEvent<AssessResponse>) => {
        if (event.data.id !== request.current || 'done' in event.data) return;
        const incoming = 'point' in event.data ? [event.data.point] : event.data.points;
        const record = cache.current;
        if (!record) return;
        const merged = new Map(record.points.map(point => [point.index, point]));
        for (const point of incoming) merged.set(point.index, point);
        record.points = [...merged.values()].sort((a, b) => a.index - b.index);
        setPoints(record.points);
        saving ??= setTimeout(save, SAVE_MS);
      });
      worker.current = instance;
      window.addEventListener('pagehide', save);
      return () => {
        window.removeEventListener('pagehide', save);
        if (saving !== undefined) save();
        instance.terminate(); worker.current = null;
      };
    } catch { worker.current = null; }
  }, [active, initial, viewer]);
  useEffect(() => {
    if (!active || !initial) return;
    const record = cache.current = syncAssessment(cache.current, initial, viewer, commands);
    setPoints(record.points);
    const timer = setTimeout(() => worker.current?.postMessage({ id: ++request.current, initial, current, commands, viewer, saved: record } satisfies AssessRequest), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active, initial, current, commands, viewer]);
  return active ? points.filter(p => p.index <= commands.length) : [];
}
