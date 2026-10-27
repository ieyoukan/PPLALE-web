'use client';

// The game's settings, the same in the launchpad's 設定 tab and on /game/settings/: the home room's
// visibility (the room opening the game makes), the notification sound, the browser's notifications
// and the account.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { roomVisibilities } from '@pplale/game-core/room';
import type { RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { readRoomSettings, saveRoomSettings } from '@/lib/game/plazaSettings';
import { PushToggle } from '@/components/pwa/PushToggle';
import { NotificationVolumeControl } from '../notifications/GameNotifications';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { visibilityInfo } from '../plaza/visibility';
import styles from './GameSettings.module.css';

/** In the order of the menu's new room: from everyone to only those invited. */
const homeKinds: RoomVisibility[] = ['public', 'friendsPlus', 'friends', 'invitePlus', 'invite'];

export function GameSettings({ volume = true, onLeave }: { volume?: boolean; onLeave?: () => void }) {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [home, setHome] = useState<RoomVisibility | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setHome(readRoomSettings().homeVisibility); }, []);
  const choose = (kind: RoomVisibility) => { saveRoomSettings({ homeVisibility: kind }); setHome(kind); };
  const handleSwitchAccount = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
      await signInWithGoogle();
    } catch {}
    finally {
      setBusy(false);
    }
  };
  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch {}
    finally {
      setBusy(false);
    }
  };
  return <div className={styles.settings}>
    <section className={styles.section} aria-labelledby="settings-home">
      <h3 id="settings-home" data-ui-title><GameIcon name="home" />ホームルームの公開範囲</h3>
      <p className={styles.note}>ゲームを開いたときに作るルームの公開範囲です</p>
      <select className={styles.visibilitySelect} aria-labelledby="settings-home" aria-describedby="settings-home-note" value={home ?? 'invite'} disabled={home === null} onChange={event => choose(event.target.value as RoomVisibility)}>
        {homeKinds.filter(kind => roomVisibilities.includes(kind)).map(kind => {
          const needsLogin = !user && (kind === 'friends' || kind === 'friendsPlus');
          return <option key={kind} value={kind} disabled={needsLogin}>{visibilityInfo[kind].label}{needsLogin ? '（ログインが必要）' : ''}</option>;
        })}
      </select>
      <p id="settings-home-note" className={styles.note}>{visibilityInfo[home ?? 'invite'].note}</p>
    </section>
    {volume && <section className={styles.section}><NotificationVolumeControl /></section>}
    {user && <section className={styles.section} aria-labelledby="settings-push"><h3 id="settings-push" data-ui-title><GameIcon name="bell" />ブラウザの通知</h3><PushToggle /></section>}
    <section className={styles.section} aria-labelledby="settings-account">
      <h3 id="settings-account" data-ui-title><GameIcon name="star" />アカウント</h3>
      <div className={styles.links}>
        {user ? <>
          <Link className={styles.link} href="/game/profile/" onClick={onLeave} prefetch={false}><GameIcon name="star" />プロフィール</Link>
          <button className={styles.link} disabled={busy} onClick={() => void handleSwitchAccount()}><GameIcon name="heart" />アカウントを切り替える</button>
          <button className={styles.link} disabled={busy} onClick={() => void handleSignOut()}><GameIcon name="exit" />ログアウト</button>
        </> : <button className={styles.link} onClick={() => void signInWithGoogle().catch(() => {})}><GameIcon name="heart" />ログイン</button>}
        <Link className={styles.link} href="/" onClick={onLeave}><GameIcon name="exit" />サイトへ</Link>
      </div>
    </section>
  </div>;
}
