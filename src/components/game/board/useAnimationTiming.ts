'use client';

import { useSyncExternalStore } from 'react';

const standard = { draw: 360, rest: 80, strikeHit: 360, strike: 720, announceHit: 1900, announce: 2400, pingHit: 700, ping: 1200, choiceHit: 1000, choice: 1500 };
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
 * CSSと操作ロックで同じ時間を使い、着地前の連打を受け付けない。
 * ドローは移動360ms＋着地80ms。ルーム・CPU対戦とも同じテンポに揃える。
 */
export function useAnimationTiming() {
  const minimal = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return minimal ? standardReduced : standard;
}
