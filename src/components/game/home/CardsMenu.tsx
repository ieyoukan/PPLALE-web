import Link from 'next/link';
import { CARD_GALLERY_PATH } from '@/lib/game/sessionStore';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './CardsMenu.module.css';

/** The カード screen: where to look at cards and where to build a deck, one card-like door each. */
export function CardsMenu() {
  return <div className={styles.tiles}>
    <OrnateFrame as={Link} size="sm" href={CARD_GALLERY_PATH} className={styles.tile} data-tone="gallery">
      <GameIcon name="cards" /><b data-ui-title>図鑑</b><span>幼女・お菓子・プレイアブル・トークンを見る</span>
    </OrnateFrame>
    <OrnateFrame as={Link} size="sm" href="/build" className={styles.tile} data-tone="build">
      <GameIcon name="pen" /><b data-ui-title>デッキ構築</b><span>デッキを作って保存する（デッキ構築ページへ）</span>
    </OrnateFrame>
  </div>;
}
