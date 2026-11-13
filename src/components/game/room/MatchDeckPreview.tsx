import type { Deck } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { GameCard } from '../GameCard';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import styles from './Room.module.css';

/** Actual selected cards; a random deck stays face down until it is made when searching starts. */
export function MatchDeckPreview({ name, deck }: { name: string; deck: Deck | null }) {
  const { t } = useI18n();
  const cardName = useCardName();
  const cards = deck ? [deck.yojo[0], deck.sweet[0], deck.playable] : [null, null, null];
  return <div className={styles.matchDeckPreview} role="group" aria-label={t('選択中のデッキ')}>
    <div className={styles.matchDeckArt} aria-hidden="true">
      {cards.map((id, index) => <span key={index} className={styles.matchDeckCard}>
        {id ? <GameCard id={id} sizes="64px" /> : <b>?</b>}
      </span>)}
    </div>
    <div className={styles.matchDeckInfo}>
      <strong>{t(name)}</strong>
      <span>{deck ? displayCards[deck.playable] && cardName(deck.playable, displayCards[deck.playable].name) : t('対戦のたびに、新しい組み合わせ')}</span>
      {deck && <small>{t('幼女 {count}枚', { count: deck.yojo.length })} <i /> {t('お菓子 {count}枚', { count: deck.sweet.length })}</small>}
    </div>
  </div>;
}
