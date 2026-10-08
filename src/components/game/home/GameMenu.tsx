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
import styles from './GameMenu.module.css';

const tabs = [
  { href: HOME_PATH, label: 'CPU対決', note: 'ひとりであそぶ', tone: styles.pink },
  { href: BATTLE_PATH, label: 'バトル', note: 'ルームマッチ', tone: styles.green },
  { href: CARDS_PATH, label: 'カード', note: '図鑑・デッキ構築', tone: styles.lilac },
  { href: EDITOR_PATH, label: '盤面エディタ', note: '好きな盤面から', tone: styles.yellow },
];

export default function GameMenu({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? HOME_PATH;
  const { user, signInWithGoogle } = useAuth();
  // The first tab is the root, so it only matches exactly; the others also cover their sub-pages.
  const current = tabs.find(tab => tab.href !== HOME_PATH && pathname.startsWith(tab.href)) ?? tabs[0];
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
          <b>{user?.displayName || 'ゲスト'}</b>
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
