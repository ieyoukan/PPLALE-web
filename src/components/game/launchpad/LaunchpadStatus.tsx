'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { PlayerIdentity } from '@/components/shared/player/PlayerIdentity';
import { guestIcon } from '@/components/shared/player/useProfiles';
import { useMyProfile } from '../social/useMyProfile';
import { usePlaza } from '../plaza/PlazaProvider';
import { roomServerUrl } from '@/lib/game/room/client';
import { useLaunchpad } from './LaunchpadContext';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './LaunchpadStatus.module.css';

/** Stays above every tab of the compact pad, including profiles. */
export function LaunchpadStatus() {
  const { user, loading } = useAuth(), profile = useMyProfile();
  const { view } = usePlaza(), { openAt } = useLaunchpad(), { t, nameText } = useI18n();
  const room = view?.plaza, member = room?.members.find(member => member.id === room.me);
  // An identity change re-enters the room asynchronously; never show the previous account here.
  const self = !loading && member?.profileId === user?.uid ? member : undefined;
  const name = loading ? '…' : user ? profile?.displayName || (self?.name && nameText(self.name)) || t('プレイヤー') : (self?.name && nameText(self.name)) || t('ゲスト');
  const card = user ? profile?.iconCardId : guestIcon(self?.id ?? '');
  return <div className={styles.status} role="group" aria-label={t('プレイヤーと時計')}>
    <button type="button" className={styles.profile} aria-label={t('自分のプロフィール')} title={t('自分のプロフィール')} onClick={() => openAt({ section: 'profile' })}>
      <PlayerIdentity name={name} card={card} />
    </button>
    <LaunchpadClock />
    <LaunchpadStats />
  </div>;
}

/** Only the clock updates each minute; the room and the rest of the menu do not rerender. */
function LaunchpadClock() {
  const [time, setTime] = useState('--:--'), { t } = useI18n();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
      timer = setTimeout(refresh, 60_000 - Date.now() % 60_000);
    };
    refresh(); document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <time className={styles.clock} dateTime={time === '--:--' ? undefined : time} aria-label={t('現在の時刻')}>{time}</time>;
}

/** Beside the clock, small: frames per second and the round trip to the room server, measured only while the pad is open. */
function LaunchpadStats() {
  const [fps, setFps] = useState<number | null>(null), [ping, setPing] = useState<number | null>(null);
  useEffect(() => {
    let frame = 0, frames = 0, since = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - since >= 1000) { setFps(Math.round(frames * 1000 / (now - since))); frames = 0; since = now; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!roomServerUrl) return;
    let timer: ReturnType<typeof setTimeout>, stopped = false, warm = false;
    // The server's health check: no room work, so the time is the network's. The first request also opens
    // the connection (hundreds of ms), so it is not shown and the next one follows at once.
    const measure = async () => {
      const start = performance.now();
      try {
        await (await fetch(`${roomServerUrl}/healthz`, { cache: 'no-store' })).arrayBuffer();
        if (!stopped && warm) setPing(Math.round(performance.now() - start));
      } catch { if (!stopped) setPing(null); }
      if (!stopped) timer = setTimeout(measure, warm ? 3000 : 0);
      warm = true;
    };
    void measure();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return <span className={styles.stats}>
    <span>{fps ?? '--'} FPS</span>
    {roomServerUrl && <span>{ping ?? '--'} ms</span>}
  </span>;
}
