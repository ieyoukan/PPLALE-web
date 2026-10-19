'use client';

import { useEffect, useState } from 'react';
import type { RemoteSession } from '../board/useGameSession';
import styles from './TurnClock.module.css';

type Clock = NonNullable<RemoteSession['turnClock']>;
const remaining = (clock: Clock) => clock.deadline === null ? clock.remainingMs
  : Math.max(0, clock.deadline - clock.serverNow - (performance.now() - clock.receivedAt));

/** Updates only this small gauge; the board and the server never tick along with it. */
export function TurnClock({ clock }: { clock: Clock }) {
  const [left, setLeft] = useState(() => remaining(clock));
  useEffect(() => {
    setLeft(remaining(clock));
    if (clock.deadline === null) return;
    const timer = setInterval(() => setLeft(remaining(clock)), 250);
    return () => clearInterval(timer);
  }, [clock]);
  const seconds = Math.ceil(left / 1000), paused = clock.deadline === null;
  return <div className={styles.clock} role="timer" aria-label="ターン残り時間" aria-live="off" data-paused={paused || undefined} data-urgent={seconds <= 20 || undefined}>
    <div className={styles.time}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{paused
        ? <path d="M8 5v14M16 5v14" />
        : <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>}</svg>
      <time>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</time>
    </div>
    <meter min={0} max={clock.limitMs} value={left} aria-label="残り時間のゲージ" />
    {paused && <small>選択待ち</small>}
  </div>;
}
