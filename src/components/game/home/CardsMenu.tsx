import Link from 'next/link';
import { CARD_GALLERY_PATH, DECKS_PATH } from '@/lib/game/sessionStore';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './CardsMenu.module.css';

const destinations = [
  { href: CARD_GALLERY_PATH, label: '図鑑', note: 'すべてのカードを見る', icon: 'cards', tone: 'gallery' },
  { href: DECKS_PATH, label: 'デッキ', note: '保存したデッキ・新しく作る', icon: 'pen', tone: 'build' },
  { href: '/deck/2pick', label: '2Pick構築', note: '2枚から選んでデッキを作る', icon: 'cards', tone: 'gallery', external: true },
  { href: '/deck-view', label: 'デッキ画像', note: 'デッキコードから画像を作る', icon: 'grid', tone: 'build', external: true },
] as const;

/** Site tools open alongside the game so their room connection stays alive. */
export function CardsMenu() {
  return <div className={styles.tiles}>{destinations.map(destination => {
    const external = 'external' in destination && destination.external;
    return <OrnateFrame key={destination.href} as={Link} size="sm" href={destination.href} prefetch={external ? false : undefined} className={styles.tile} data-tone={destination.tone} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      <GameIcon name={destination.icon} /><b data-ui-title>{destination.label}</b><span>{destination.note}{external && <small>別タブで開く <GameIcon name="expand" /></small>}</span>
    </OrnateFrame>;
  })}</div>;
}
