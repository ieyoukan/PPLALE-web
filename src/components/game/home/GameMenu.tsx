'use client';

// The frame around everything outside the board: a column of tabs (ルーム / CPU対決 / バトル / カード / 盤面エディタ …)
// with the logo and the player on the left, and the chosen tab's page on the right. The game opens
// in the player's room, which the first tab goes back to; the game's menu opens from here too.
import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { BATTLE_PATH, CARDS_PATH, CPU_PATH, EDITOR_PATH, HOME_PATH, NOTIFICATIONS_PATH, PUZZLES_PATH } from '@/lib/game/sessionStore';
import { useLaunchpad } from '../plaza/LaunchpadContext';
import { PlazaIcon } from '../plaza/PlazaIcon';
import { plazaHref, usePlaza } from '../plaza/PlazaProvider';
import { useMyProfile } from '../social/useMyProfile';
import { RecordedCard } from '../history/RecordedCard';
import styles from './GameMenu.module.css';
import { NotificationSoundToggle } from '../notifications/GameNotifications';
import menuBackground from '@/lib/game/generated/menu-assets.json';

const tabs = [
  { href: HOME_PATH, label: 'ホーム', note: 'みんなで遊ぶ場所', tone: styles.yellow },
  { href: CPU_PATH, label: 'CPU対決', note: 'ひとりであそぶ', tone: styles.pink },
  { href: BATTLE_PATH, label: 'バトル', note: 'フリーマッチ・履歴', tone: styles.green },
  { href: PUZZLES_PATH, label: 'リーサルパズル', note: 'このターンで勝利！', tone: styles.sage },
  { href: CARDS_PATH, label: 'カード', note: '図鑑・デッキ構築', tone: styles.lilac },
  { href: EDITOR_PATH, label: '盤面エディタ', note: '好きな盤面から', tone: styles.yellow },
  { href: '/game/social/', label: 'ソーシャル', note: 'フレンドの現在地', tone: styles.pink },
  { href: NOTIFICATIONS_PATH, label: '通知', note: 'フレンド申請', tone: styles.lilac },
];

export default function GameMenu({ children, overlay }: { children: ReactNode; overlay?: { title: string; tools: ReactNode; onReturn?: () => void; dock?: boolean } }) {
  const pathname = usePathname() ?? HOME_PATH;
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // The stage stays fixed while each menu page scrolls inside its own pane.
    if (body.current) { body.current.scrollTop = 0; body.current.scrollLeft = 0; }
  }, [pathname]);
  const { user, signInWithGoogle } = useAuth();
  const profile = useMyProfile();
  const launchpad = useLaunchpad(), plaza = usePlaza();
  // The first tab is the root, so it only matches exactly; the others also cover their sub-pages.
  const current = pathname.startsWith('/game/performance') ? { label: '通信計測' } : pathname.startsWith('/game/profile') ? { label: 'プロフィール' } : tabs.find(tab => tab.href !== HOME_PATH && pathname.startsWith(tab.href)) ?? tabs[0];
  return <>
    <link rel="preload" as="image" type="image/avif" href={menuBackground.avif} fetchPriority="high" />
    <div className={`${styles.menu} ${pathname === CPU_PATH ? styles.home : ''} ${pathname.startsWith(PUZZLES_PATH) ? styles.puzzleMenu : ''}`} style={{ '--menu-background': `image-set(url("${menuBackground.avif}") type("image/avif"), url("${menuBackground.webp}") type("image/webp"))` } as CSSProperties}>
    <aside className={styles.side}>
      <div className={styles.brand}>
        <Image className={styles.logo} src="/images/game/logo.webp" alt="お菓子争奪戦争 ぷぷりえーる" width={462} height={227} priority />
        <button className={styles.launch} onClick={overlay ? overlay.onReturn ?? launchpad.close : launchpad.open} aria-label={overlay ? '盤面に戻る' : 'メニューを開く（Esc）'} title="メニュー（Esc）"><PlazaIcon name={overlay ? 'home' : 'grid'} /></button>
      </div>
      <nav className={styles.tabs} aria-label="ゲームメニュー" data-landscape-action>{tabs.map(tab =>
        <Link key={tab.href} href={tab.href === HOME_PATH && plaza.id ? plazaHref(plaza.id) : tab.href} prefetch={false} className={`${styles.tab} ${tab.tone}`} aria-current={tab === current ? 'page' : undefined}>
          <b data-ui-title>{tab.label}</b><small>{tab.note}</small>
        </Link>)}
      </nav>
      <div className={styles.foot}>
        <div className={styles.player}>
          <small>PLAYER</small>
          <Link href="/game/profile/" prefetch={false} className={styles.playerProfile}><span className={styles.playerAvatar}><RecordedCard id={profile?.iconCardId ?? 'p_1'} sizes="40px" /></span><b>{profile?.displayName || (user ? 'プレイヤー' : 'ゲスト')}</b></Link>
          {!user && <button onClick={() => { signInWithGoogle().catch(() => {}); }}>ログイン</button>}
        </div>
        <div className={styles.footerActions}><NotificationSoundToggle compact /><Link href="/" className={styles.back} aria-label="サイトへ戻る"><span className={styles.backLong}>サイトへ戻る</span><span className={styles.backShort}>サイト</span></Link></div>
      </div>
    </aside>
    {/* The root layout already provides <main>. */}
    <section className={styles.pane}>
      <header className={overlay ? styles.paneHead : undefined}><h1>{overlay?.title ?? (pathname.startsWith(PUZZLES_PATH) ? 'ロリの一手を極めるために' : current.label)}</h1>{overlay?.tools}</header>
      <div ref={body} className={`${styles.body} ${overlay?.dock ? styles.overlayBody : ''}`}>{children}</div>
    </section>
  </div></>;
}
