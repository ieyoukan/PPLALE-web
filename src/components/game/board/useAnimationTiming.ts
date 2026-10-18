'use client';

import { useSyncExternalStore } from 'react';

const standard = { draw: 800, rest: 200, strikeHit: 360, strike: 720, announceHit: 1900, announce: 2400, pingHit: 700, ping: 1200, choiceHit: 1000, choice: 1500 };
const reduced = (timing: typeof standard) => ({ ...timing, draw: 10, rest: 0, strikeHit: 5, strike: 10, pingHit: 5, ping: 10 });
const standardReduced = reduced(standard);
const query = '(prefers-reduced-motion: reduce)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

/**
 * One source for CSS durations and the timers that release interaction. Online matches use the same
 * pace as CPU matches: waiting is cut by overlapping the request with the animation, not by shortening it.
 */
export function useAnimationTiming() {
  const minimal = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return minimal ? standardReduced : standard;
}
