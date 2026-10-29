'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { PlayerIdentity } from '@/components/shared/player/PlayerIdentity';
import { guestIcon } from '@/components/shared/player/useProfiles';
import { useMyProfile } from '../social/useMyProfile';
import { usePlaza } from '../plaza/PlazaProvider';
import { useLaunchpad } from './LaunchpadContext';
import styles from './LaunchpadStatus.module.css';

/** Stays above every tab of the compact pad, including profiles. */
export function LaunchpadStatus() {
  const { user, loading } = useAuth(), profile = useMyProfile();
  const { view } = usePlaza(), { openAt } = useLaunchpad();
  const room = view?.plaza, member = room?.members.find(member => member.id === room.me);
  // An identity change re-enters the room asynchronously; never show the previous account here.
  const self = !loading && member?.profileId === user?.uid ? member : undefined;
  const name = loading ? '…' : user ? profile?.displayName || self?.name || 'プレイヤー' : self?.name || 'ゲスト';
  const card = user ? profile?.iconCardId : guestIcon(self?.id ?? '');
  return <div className={styles.status} aria-label="プレイヤーと時計">
    <button type="button" className={styles.profile} aria-label="自分のプロフィール" title="自分のプロフィール" onClick={() => openAt({ section: 'profile' })}>
      <PlayerIdentity name={name} card={card} />
    </button>
    <LaunchpadClock />
  </div>;
}

/** Only the clock updates each minute; the room and the rest of the menu do not rerender. */
function LaunchpadClock() {
  const [time, setTime] = useState('--:--');
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
  return <time className={styles.clock} dateTime={time === '--:--' ? undefined : time} aria-label="現在の時刻">{time}</time>;
}
