'use client';

import { useRef, useState } from 'react';
import { checkPassword, rememberPassword } from '@/lib/game/lockedPuzzles';
import { useI18n } from '@/i18n/LocaleProvider';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { PuzzleIcon } from './PuzzleIcon';
import styles from './Puzzles.module.css';

const OPEN_MS = 700;

/** 鍵のかかったフルーツ。問題の枚数だけ伏せたカードを見せ、あいことばで開ける。 */
export function PuzzleLock({ fruit, label, count }: { fruit: string; label: string; count: number }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'wrong' | 'open'>('idle');
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (!value.trim() || state === 'checking' || state === 'open') return;
    setState('checking');
    if (await checkPassword(fruit, value)) {
      setState('open');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.setTimeout(() => rememberPassword(fruit, value), reduced ? 0 : OPEN_MS);
    } else {
      setState('wrong');
      setValue('');
      input.current?.focus();
    }
  };
  return <div className={styles.locked} data-state={state}>
    <OrnateFrame as="form" size="sm" className={styles.lockForm} aria-label={t('{label}のパズルを開ける', { label: t(label) })} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <svg className={styles.padlock} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path className={styles.shackle} d="M20 30V20a12 12 0 0 1 24 0v10" />
        <rect x="12" y="29" width="40" height="29" rx="7" />
        <path className={styles.keyhole} d="M32 39v8" />
      </svg>
      <div className={styles.lockField}>
        <input
          ref={input}
          type="password"
          value={value}
          onChange={event => { setValue(event.target.value); if (state === 'wrong') setState('idle'); }}
          placeholder={t('あいことば')}
          aria-label={t('あいことば')}
          aria-invalid={state === 'wrong'}
          autoComplete="off"
          enterKeyHint="go"
          disabled={state === 'open'}
        />
        <button type="submit" aria-label={t('開ける')} disabled={!value.trim() || state === 'checking' || state === 'open'}><PuzzleIcon name="key" /></button>
      </div>
      <span className={styles.lockStatus} role="status">{state === 'wrong' ? t('あいことばが違います') : ''}</span>
    </OrnateFrame>
    <ul className={`${styles.grid} ${styles.sealedGrid}`} aria-label={t('{count}問', { count })}>
      {Array.from({ length: count }, (_, index) => <li key={index} className={styles.sealed} style={{ animationDelay: `${index * 40}ms` }}><PuzzleIcon name="lock" /></li>)}
    </ul>
  </div>;
}
