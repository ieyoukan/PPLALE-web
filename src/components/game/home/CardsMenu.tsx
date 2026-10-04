import Link from 'next/link';
import { CARD_GALLERY_PATH } from '@/lib/game/sessionStore';
import styles from './CardsMenu.module.css';

/** The カード tab: where to look at cards and where to build a deck. */
export function CardsMenu() {
  return <div className={styles.tiles}>
    <Link href={CARD_GALLERY_PATH} className={styles.tile}><b>図鑑</b><span>幼女・お菓子・プレイアブル・トークンを見る</span></Link>
    <Link href="/build" className={styles.tile}><b>デッキ構築</b><span>デッキを作って保存する（デッキ構築ページへ）</span></Link>
  </div>;
}
