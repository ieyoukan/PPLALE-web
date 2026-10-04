'use client';

// The game's home: the way into solo play, battles and the cards. Laid out like a card game's
// lobby: who is playing (top left), the main action (right), and a menu along the bottom.
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { displayCards } from '@/lib/game/catalog';
import { BATTLE_PATH, CARDS_PATH, PLAY_PATH, SOLO_PATH, describeSavedMatch } from '@/lib/game/sessionStore';
import styles from './GameHome.module.css';

/** The playables shown as the key visual, back to front. */
const cast = ['p_1', 'p_4', 'p_0'];
const icons = {
  solo: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-7 18a7 7 0 0 1 14 0Z',
  battle: 'M4 3l9 9-2 2-9-9V3Zm16 0v2l-9 9-2-2 9-9ZM6 15l3 3-3 3-3-3Zm12 0l3 3-3 3-3-3Z',
  home: 'M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3Z',
  cards: 'M4 6h10v14H4Zm6-3h10v14h-4V4h-6Z',
};
const Icon = ({ name }: { name: keyof typeof icons }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg>;

export default function GameHome() {
  const { user, signInWithGoogle } = useAuth();
  const [saved, setSaved] = useState<string | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  // localStorage is only available in the browser, after the first render.
  useEffect(() => { setSaved(describeSavedMatch()); }, []);

  return <main className={styles.home} onClick={() => setCardsOpen(false)}>
    <div className={styles.backdrop} aria-hidden="true" />
    <header className={styles.top}>
      <div className={styles.profile}>
        <span className={styles.avatar} style={user?.photoURL ? { backgroundImage: `url("${user.photoURL}")` } : undefined} aria-hidden="true" />
        <span className={styles.profileText}>
          <small>PLAYER</small>
          <b>{user?.displayName || 'ゲスト'}</b>
        </span>
        {!user && <button onClick={() => { signInWithGoogle().catch(() => {}); }}>ログイン</button>}
      </div>
      <Link href="/" className={styles.site}>サイトのトップへ</Link>
    </header>

    <div className={styles.stage} aria-hidden="true">
      <Image className={styles.logo} src="/images/game/cafe-logo.svg" alt="" width={1568} height={882} unoptimized priority />
      <div className={styles.cast}>{cast.map(id => displayCards[id] && <span key={id}><Image src={displayCards[id].imageUrl} alt="" fill sizes="(max-width: 700px) 30vw, 280px" /></span>)}</div>
    </div>

    {saved && <Link href={PLAY_PATH} className={styles.resume}><span>前回の対戦を続ける</span><small>{saved}</small></Link>}
    <Link href={SOLO_PATH} className={styles.emblem}><span><b>CPU対決</b><small>ひとりであそぶ</small></span></Link>

    <nav className={styles.nav} aria-label="ゲームメニュー">
      <Link href={SOLO_PATH}><Icon name="solo" />CPU対決</Link>
      <Link href={BATTLE_PATH}><Icon name="battle" />バトル</Link>
      <span className={styles.current} aria-current="page"><Icon name="home" />ホーム</span>
      <div className={styles.cardsMenu}>
        <button aria-expanded={cardsOpen} aria-controls="game-home-cards" onClick={event => { event.stopPropagation(); setCardsOpen(open => !open); }}><Icon name="cards" />カード</button>
        {cardsOpen && <div id="game-home-cards" className={styles.submenu} onClick={event => event.stopPropagation()}>
          <Link href={CARDS_PATH}>図鑑</Link>
          <Link href="/build">デッキ構築</Link>
        </div>}
      </div>
    </nav>
  </main>;
}
