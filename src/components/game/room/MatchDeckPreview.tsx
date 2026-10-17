import type { Deck } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { GameCard } from '../GameCard';
import styles from './Room.module.css';

/** Actual selected cards; a random deck stays face down until it is made when searching starts. */
export function MatchDeckPreview({ name, deck }: { name: string; deck: Deck | null }) {
  const cards = deck ? [deck.yojo[0], deck.sweet[0], deck.playable] : [null, null, null];
  return <div className={styles.matchDeckPreview} aria-label="選択中のデッキ">
    <div className={styles.matchDeckArt} aria-hidden="true">
      {cards.map((id, index) => <span key={index} className={styles.matchDeckCard}>
        {id ? <GameCard id={id} sizes="64px" /> : <b>?</b>}
      </span>)}
    </div>
    <div className={styles.matchDeckInfo}>
      <strong>{name}</strong>
      <span>{deck ? displayCards[deck.playable]?.name : '対戦のたびに、新しい組み合わせ'}</span>
      {deck && <small>幼女 {deck.yojo.length}枚 <i /> お菓子 {deck.sweet.length}枚</small>}
    </div>
  </div>;
}
