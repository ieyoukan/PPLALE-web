'use client';

import { useEffect, useState } from 'react';
import { currentSubscription, disablePush, enablePush, pushAvailability, pushKey, refreshPush } from '@/lib/game/push';
import type { PushAvailability } from '@/lib/game/push';
import styles from './PushToggle.module.css';

/** What a tap on a bell that cannot ring tells. */
const HINTS: Partial<Record<PushAvailability, string>> = {
  install: 'ホーム画面に追加すると届くよ',
  denied: 'ブラウザの設定で通知を許可してね',
};

/**
 * The bell of a signed-in player: on, this browser is told of their turn, a player in their room and
 * friends' requests while the game is not on the screen. Also registers the subscription again once a visit.
 */
export function PushToggle() {
  const [availability, setAvailability] = useState<PushAvailability | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let live = true;
    const ready = pushAvailability();
    void Promise.all([pushKey(), currentSubscription().catch(() => null)]).then(([key, subscription]) => {
      if (!live) return;
      // Without the server's key nothing could be sent: no bell.
      setAvailability(key ? ready : 'unsupported');
      setOn(!!subscription && ready === 'ready' && Notification.permission === 'granted');
    });
    void refreshPush().catch(() => {});
    return () => { live = false; };
  }, []);

  if (!availability || availability === 'unsupported') return null;
  const toggle = async () => {
    if (availability !== 'ready') { setHint(shown => !shown); return; }
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); }
      else {
        const granted = await enablePush();
        setOn(granted);
        if (!granted) { setAvailability(pushAvailability()); setHint(true); }
      }
    } catch { /* The bell stays as it was. */ } finally { setBusy(false); }
  };
  return <span className={styles.wrap}>
    <button className={styles.bell} data-on={on || undefined} disabled={busy} aria-pressed={on} aria-label={on ? '通知を止める' : '通知を受け取る'} onClick={() => void toggle()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />{!on && <path className={styles.slash} d="M4 4l16 16" />}</svg>
    </button>
    {hint && HINTS[availability] && <span className={styles.hint} role="status">{HINTS[availability]}</span>}
  </span>;
}
