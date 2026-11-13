'use client';

// The game's settings, the same in the launchpad's 設定 tab and on /game/settings/: the home room's
// visibility (the room opening the game makes), the notification sound, the browser's notifications
// and the account.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { roomVisibilities } from '@pplale/game-core/room';
import type { RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/LocaleProvider';
import { APP_LOCALES } from '@/i18n/config';
import { readRoomSettings, saveRoomSettings } from '@/lib/game/plazaSettings';
import { PushToggle } from '@/components/pwa/PushToggle';
import { SoundSettings } from '../audio/SoundSettings';
import { saveCardControl, useCardControl } from '@/lib/game/controlSettings';
import type { CardControl } from '@/lib/game/controlSettings';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { visibilityInfo } from '../plaza/visibility';
import styles from './GameSettings.module.css';

/** In the order of the menu's new room: from everyone to only those invited. */
const homeKinds: RoomVisibility[] = ['public', 'friendsPlus', 'friends', 'invitePlus', 'invite'];

export function GameSettings({ volume = true, onLeave }: { volume?: boolean; onLeave?: () => void }) {
  const { user, signInWithGoogle, signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();
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
      <h3 id="settings-home" data-ui-title><GameIcon name="home" />{t('ホームルームの公開範囲')}</h3>
      <p className={styles.note}>{t('ゲームを開いたときに作るルームの公開範囲です')}</p>
      <select className={styles.visibilitySelect} aria-labelledby="settings-home" aria-describedby="settings-home-note" value={home ?? 'invite'} disabled={home === null} onChange={event => choose(event.target.value as RoomVisibility)}>
        {homeKinds.filter(kind => roomVisibilities.includes(kind)).map(kind => {
          const needsLogin = !user && (kind === 'friends' || kind === 'friendsPlus');
          return <option key={kind} value={kind} disabled={needsLogin}>{t(visibilityInfo[kind].label)}{needsLogin ? t('（ログインが必要）') : ''}</option>;
        })}
      </select>
      <p id="settings-home-note" className={styles.note}>{t(visibilityInfo[home ?? 'invite'].note)}</p>
    </section>
    <CardControlSetting />
    {/* Both names, so someone who cannot read the current language still finds it. */}
    <section className={styles.section} aria-labelledby="settings-language">
      <h3 id="settings-language" data-ui-title><GameIcon name="globe" />言語 / Language</h3>
      <select className={styles.visibilitySelect} aria-labelledby="settings-language" value={locale} onChange={event => setLocale(event.target.value as typeof locale)}>
        {APP_LOCALES.map(option => <option key={option} value={option} lang={option}>{option === 'ja' ? '日本語' : 'English'}</option>)}
      </select>
    </section>
    {volume && <section className={styles.section}><SoundSettings /></section>}
    {user && <section className={styles.section} aria-labelledby="settings-push"><h3 id="settings-push" data-ui-title><GameIcon name="bell" />{t('ブラウザの通知')}</h3><PushToggle /></section>}
    <section className={styles.section} aria-label={t('通信')}>
      <Link className={styles.link} href="/game/performance/" onClick={onLeave} prefetch={false}><GameIcon name="history" />{t('通信計測')}</Link>
    </section>
    <section className={styles.section} aria-labelledby="settings-account">
      <h3 id="settings-account" data-ui-title><GameIcon name="star" />{t('アカウント')}</h3>
      <div className={styles.links}>
        {user ? <>
          <button className={styles.link} disabled={busy} onClick={() => void handleSwitchAccount()}><GameIcon name="heart" />{t('アカウントを切り替える')}</button>
          <button className={styles.link} disabled={busy} onClick={() => void handleSignOut()}><GameIcon name="exit" />{t('ログアウト')}</button>
        </> : <button className={styles.link} onClick={() => void signInWithGoogle().catch(() => {})}><GameIcon name="heart" />{t('ログイン')}</button>}
        <Link className={styles.link} href="/" onClick={onLeave}><GameIcon name="exit" />{t('サイトへ')}</Link>
      </div>
    </section>
  </div>;
}

/** How cards are moved in a match: held and carried, or aimed with a curved arrow. A small picture of each instead of an explanation. */
function CardControlSetting() {
  const { t } = useI18n();
  const control = useCardControl();
  const options: { value: CardControl; label: string }[] = [{ value: 'drag', label: '持って動かす' }, { value: 'aim', label: '矢印でねらう' }];
  return <section className={styles.section} aria-labelledby="settings-control">
    <h3 id="settings-control" data-ui-title><GameIcon name="cards" />{t('カードの操作')}</h3>
    <div className={styles.controls} role="radiogroup" aria-labelledby="settings-control">
      {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={control === option.value} className={styles.control} onClick={() => saveCardControl(option.value)}>
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect x="88" y="10" width="22" height="32" rx="2" className={styles.controlSlot} />
          {option.value === 'drag' ? <>
            <rect x="12" y="34" width="22" height="32" rx="2" className={styles.controlGhost} />
            <path d="M34 46 C55 40 70 30 84 26" className={styles.controlTrail} />
            <rect x="70" y="12" width="22" height="32" rx="2" className={styles.controlCard} transform="rotate(-7 81 28)" />
          </> : <>
            <rect x="12" y="30" width="22" height="32" rx="2" className={styles.controlCard} />
            <path d="M23 30 Q58 -6 96 22" className={styles.controlArrow} />
            <path d="M88 13 L99 25 L84 27 Z" className={styles.controlHead} />
          </>}
        </svg>
        <span>{t(option.label)}</span>
      </button>)}
    </div>
  </section>;
}
