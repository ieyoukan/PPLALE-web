'use client';

// The frame around everything outside the board: a column of tabs (CPU対決 / バトル / カード / 盤面エディタ) with the
// logo and the player on the left, and the chosen tab's page on the right. There is no separate
// home screen; the first tab is where the game opens.
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { BATTLE_PATH, CARDS_PATH, EDITOR_PATH, HOME_PATH } from '@/lib/game/sessionStore';
import { NOTIFICATIONS_PATH } from '../social/NotificationsPage';
import { useMyProfile } from '../social/useMyProfile';
import { RecordedCard } from '../history/RecordedCard';
import styles from './GameMenu.module.css';

const tabs = [
  { href: HOME_PATH, label: 'CPU対決', note: 'ひとりであそぶ', tone: styles.pink },
  { href: BATTLE_PATH, label: 'バトル', note: 'フリー・ルームマッチ', tone: styles.green },
  { href: CARDS_PATH, label: 'カード', note: '図鑑・デッキ構築', tone: styles.lilac },
  { href: EDITOR_PATH, label: '盤面エディタ', note: '好きな盤面から', tone: styles.yellow },
  { href: '/game/social/', label: 'ソーシャル', note: 'フレンドの現在地', tone: styles.pink },
  { href: NOTIFICATIONS_PATH, label: '通知', note: 'フレンド申請', tone: styles.lilac },
];

export default function GameMenu({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? HOME_PATH;
  const { user, signInWithGoogle } = useAuth();
  const profile = useMyProfile();
  // The first tab is the root, so it only matches exactly; the others also cover their sub-pages.
  const current = pathname.startsWith('/game/profile') ? { label: 'プロフィール' } : tabs.find(tab => tab.href !== HOME_PATH && pathname.startsWith(tab.href)) ?? tabs[0];
  return <div className={styles.menu}>
    <aside className={styles.side}>
      <Image className={styles.logo} src="/images/game/logo.webp" alt="お菓子争奪戦争 ぷぷりえーる" width={462} height={227} priority />
      <nav className={styles.tabs} aria-label="ゲームメニュー">{tabs.map(tab =>
        <Link key={tab.href} href={tab.href} className={`${styles.tab} ${tab.tone}`} aria-current={tab === current ? 'page' : undefined}>
          <b>{tab.label}</b><small>{tab.note}</small>
        </Link>)}
      </nav>
      <div className={styles.foot}>
        <div className={styles.player}>
          <small>PLAYER</small>
          <Link href="/game/profile/" className={styles.playerProfile}><span className={styles.playerAvatar}><RecordedCard id={profile?.iconCardId ?? 'p_1'} sizes="40px" /></span><b>{profile?.displayName || user?.displayName || 'ゲスト'}</b></Link>
          {!user && <button onClick={() => { signInWithGoogle().catch(() => {}); }}>ログイン</button>}
        </div>
        <Link href="/" className={styles.back}>サイトへ戻る</Link>
      </div>
    </aside>
    {/* The root layout already provides <main>. */}
    <section className={styles.pane}>
      <h1>{current.label}</h1>
      <div className={styles.body}>{children}</div>
    </section>
  </div>;
}
