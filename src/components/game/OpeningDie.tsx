'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { DieVisualState } from './openingDieScene';
import styles from './OpeningDie.module.css';
import { useI18n } from '@/i18n/LocaleProvider';

export const DICE_THROW_DURATION = 800;
/** Brightness of the die itself while pointed at / pressed (in the scene's linear light, about the former brightness(1.12) / (.92)). */
const HOVERED = 1.28, PRESSED = .83;
export function OpeningDie({ value, rolling, interactive, label, onRoll }: {
  value: number | null; rolling: boolean; interactive: boolean; label: string; onRoll: () => void;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const { t } = useI18n();
  const visual = useRef<DieVisualState>({ value, rolling, light: 1 });
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pointer, setPointer] = useState<'hover' | 'press' | null>(null);
  const ready = interactive && !rolling && (rendered || failed);
  useLayoutEffect(() => {
    visual.current = { value, rolling, light: !ready ? 1 : pointer === 'press' ? PRESSED : pointer === 'hover' ? HOVERED : 1 };
  }, [value, rolling, ready, pointer]);
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
  // Only the die lights up (in the scene); a filter on the canvas brightened its floor too.
  const hover = (event: PointerEvent) => setPointer(event.pointerType === 'mouse' ? 'hover' : null);
  return <button type="button" className={`${styles.surface} ${ready ? styles.ready : ''}`} disabled={!ready} onClick={onRoll}
    onPointerEnter={hover} onPointerUp={hover} onPointerDown={() => setPointer('press')} onPointerLeave={() => setPointer(null)} onPointerCancel={() => setPointer(null)}
    aria-label={interactive ? t('{name}のサイコロを振る', { name: label }) : rolling ? t('{name}のサイコロが回転中', { name: label }) : value === null ? t('{name}のサイコロ', { name: label }) : t('{name}のサイコロ：{n}', { name: label, n: value })}>
    <span ref={host} className={`${styles.scene} ${rendered ? styles.sceneReady : ''}`} aria-hidden="true" />
    {failed && <svg className={styles.fallback} viewBox="0 0 300 320" aria-hidden="true">
      <defs><filter id="die-shadow"><feGaussianBlur stdDeviation="5" /></filter></defs>
      <ellipse cx="150" cy="247" rx="140" ry="43" fill="#35282f" />
      <path d="M72 240 171 222 249 257 149 276Z" fill="#170d17" opacity=".38" filter="url(#die-shadow)" />
      <path d="M68 123Q65 112 75 107L139 73Q150 67 161 72L223 107Q234 113 229 124L155 160Z" fill="#620c19" stroke="#701c28" />
      <path d="M68 120 148 157 148 254Q139 256 133 252L77 226Q67 221 67 209Z" fill="#500611" stroke="#631421" />
      <path d="M148 157 229 119 229 209Q229 220 219 225L164 252Q156 256 148 254Z" fill="#35040d" stroke="#50101c" />
      <g transform="matrix(.65 .34 -.65 .34 148 115)" fill="#f1f5f3">
        {({ 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[rolling ? 1 : value ?? 1] ?? [4]).map(index => <circle key={index} cx={(index % 3 - 1) * 30} cy={(Math.floor(index / 3) - 1) * 30} r="10" />)}
      </g>
    </svg>}
  </button>;
}
