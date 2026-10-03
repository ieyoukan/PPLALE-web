'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DieVisualState } from './openingDieScene';
import styles from './OpeningDie.module.css';

export const DICE_THROW_DURATION = 1800;
export function OpeningDie({ value, rolling, interactive, label, onRoll }: {
  value: number | null; rolling: boolean; interactive: boolean; label: string; onRoll: () => void;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const visual = useRef<DieVisualState>({ value, rolling, interactive });
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => { visual.current = { value, rolling, interactive }; }, [value, rolling, interactive]);
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    void import('./openingDieScene').then(({ createOpeningDieScene }) => {
      if (cancelled || !host.current) return;
      try {
        dispose = createOpeningDieScene(host.current, () => visual.current, DICE_THROW_DURATION, () => { if (!cancelled) { setRendered(false); setFailed(true); } }, () => { if (!cancelled) setRendered(true); });
      } catch { if (!cancelled) setFailed(true); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <button type="button" className={styles.surface} disabled={!interactive || !rendered && !failed} onClick={onRoll}
    aria-label={interactive ? `${label}のサイコロを振る` : rolling ? `${label}のサイコロが回転中` : `${label}のサイコロ${value === null ? '' : `：${value}`}`}>
    <span ref={host} className={`${styles.scene} ${rendered ? styles.sceneReady : ''}`} aria-hidden="true" />
    {failed && <svg className={styles.fallback} viewBox="0 0 300 320" aria-hidden="true">
      <defs><filter id="die-shadow"><feGaussianBlur stdDeviation="5" /></filter></defs>
      <path d="M72 240 171 222 249 257 149 276Z" fill="#170d17" opacity=".5" filter="url(#die-shadow)" />
      <path d="M68 123Q65 112 75 107L139 73Q150 67 161 72L223 107Q234 113 229 124L155 160Z" fill="#a36848" stroke="#9d6049" />
      <path d="M68 120 148 157 148 254Q139 256 133 252L77 226Q67 221 67 209Z" fill="#71352a" stroke="#a26a51" />
      <path d="M148 157 229 119 229 209Q229 220 219 225L164 252Q156 256 148 254Z" fill="#55251e" stroke="#7c4230" />
      <g transform="matrix(.65 .34 -.65 .34 148 115)" fill="#ffe1ad">
        {({ 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[rolling ? 1 : value ?? 1] ?? [4]).map(index => <circle key={index} cx={(index % 3 - 1) * 30} cy={(Math.floor(index / 3) - 1) * 30} r="7" />)}
      </g>
    </svg>}
  </button>;
}
