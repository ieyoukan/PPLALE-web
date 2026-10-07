'use client';

import { useEffect, useRef, useState } from 'react';
import type { Command, GameState, Side } from '@pplale/game-core';
import type { AssessedPoint, AssessRequest, AssessResponse } from './assess';

const SETTING_KEY = 'pplale-show-assessment';

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
export function useAssessment({ enabled, initial, commands, viewer }: {
  enabled: boolean; initial: GameState | null; commands: Command[]; viewer: Side;
}): AssessedPoint[] {
  const worker = useRef<Worker | null>(null), request = useRef(0);
  const [points, setPoints] = useState<AssessedPoint[]>([]);
  const active = enabled && !!initial;
  useEffect(() => {
    if (!active) return;
    try {
      const instance = new Worker(new URL('./assess.worker.ts', import.meta.url), { type: 'module' });
      instance.addEventListener('message', (event: MessageEvent<AssessResponse>) => {
        if (event.data.id !== request.current || !('point' in event.data)) return;
        const point = event.data.point;
        setPoints(previous => [...previous.filter(p => p.index !== point.index), point].sort((a, b) => a.index - b.index));
      });
      worker.current = instance;
      return () => { instance.terminate(); worker.current = null; };
    } catch { worker.current = null; }
  }, [active]);
  // A different match, or the record got shorter (undo, replay from the start): start over.
  useEffect(() => { setPoints([]); }, [initial, viewer]);
  useEffect(() => {
    if (!active || !initial || !worker.current) return;
    setPoints(previous => previous.filter(p => p.index <= commands.length));
    worker.current.postMessage({ id: ++request.current, initial, commands, viewer } satisfies AssessRequest);
  }, [active, initial, commands, viewer]);
  return active ? points.filter(p => p.index <= commands.length) : [];
}
