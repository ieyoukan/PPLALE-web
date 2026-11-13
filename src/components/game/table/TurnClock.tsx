'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/LocaleProvider';
import type { RemoteSession } from '../board/useGameSession';
import styles from './TurnClock.module.css';

type Clock = NonNullable<RemoteSession['turnClock']>;
const remaining = (clock: Clock) => clock.deadline === null ? clock.remainingMs
  : Math.max(0, clock.deadline - clock.serverNow - (performance.now() - clock.receivedAt));

/** Updates only this small gauge; the board and the server never tick along with it. */
export function TurnClock({ clock, compact = false }: { clock: Clock; compact?: boolean }) {
  const [left, setLeft] = useState(() => remaining(clock));
  const { t } = useI18n();
  useEffect(() => {
    setLeft(remaining(clock));
    if (clock.deadline === null) return;
    const timer = setInterval(() => setLeft(remaining(clock)), 250);
    return () => clearInterval(timer);
  }, [clock]);
  const seconds = Math.ceil(left / 1000), paused = clock.deadline === null;
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  // Around the end-turn button: a ring that empties clockwise from the top, with the time beneath.
  if (compact) {
    const share = clock.limitMs ? Math.max(0, Math.min(1, left / clock.limitMs)) : 0;
    return <div className={styles.ring} role="timer" aria-label={t('ターン残り時間')} aria-live="off" data-paused={paused || undefined} data-urgent={seconds <= 20 || undefined}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className={styles.track} cx="50" cy="50" r="46" pathLength={100} />
        <circle className={styles.left} cx="50" cy="50" r="46" pathLength={100} strokeDasharray={`${share * 100} 100`} />
      </svg>
      <time className={styles.ringTime}>{label}</time>
    </div>;
  }
  return <div className={styles.clock} role="timer" aria-label={t('ターン残り時間')} aria-live="off" data-paused={paused || undefined} data-urgent={seconds <= 20 || undefined}>
    <div className={styles.time}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{paused
        ? <path d="M8 5v14M16 5v14" />
        : <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>}</svg>
      <time>{label}</time>
    </div>
    <meter min={0} max={clock.limitMs} value={left} aria-label={t('残り時間のゲージ')} />
    {paused && <small>{t('選択待ち')}</small>}
  </div>;
}
