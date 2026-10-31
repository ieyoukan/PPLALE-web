'use client';

// デッキ管理の画面で共用する小さな部品：表示中の言語のカード、カード画像、コストカーブ、使っているフルーツ。
import { useMemo } from 'react';
import Image from 'next/image';
import { fruits as fruitOrder } from '@pplale/game-core';
import type { Fruit } from '@pplale/game-core';
import { getCardCatalog } from '@/data/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import type { CardInfo } from '@/types/card';
import styles from './Decks.module.css';

/** The cards in the current language (names, effects and the English card images), by id. */
export function useCards() {
  const { locale } = useI18n();
  return useMemo(() => {
    const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
    return { byId: new Map<string, CardInfo>([...allYojoCards, ...allSweetCards, ...allPlayableCards].map(card => [card.id, card])), yojo: allYojoCards, sweet: allSweetCards, playable: allPlayableCards };
  }, [locale]);
}
export type Cards = ReturnType<typeof useCards>;

/**
 * A whole card at 2:3, with no frame of its own. The picture cannot be dragged out, selected or kept
 * with a long press (Decks.module.css `.card`); dragging is the deck's own.
 */
export function CardImage({ card, sizes, eager }: { card: CardInfo | undefined; sizes: string; eager?: boolean }) {
  return <span className={styles.card}>{card && <Image src={card.imageUrl} alt={card.name} fill sizes={sizes} draggable={false} loading={eager ? 'eager' : undefined} />}</span>;
}

export function CardBack({ sizes = '100px' }: { sizes?: string }) {
  return <span className={styles.card}><Image src="/images/back-card.webp" alt="" fill sizes={sizes} draggable={false} /></span>;
}

/** By cost (1 … 7+, a cost of 0 or more than 7 counted at the ends), as bars with their counts above. */
export function CostCurve({ ids, cards, kind, height = 30 }: { ids: string[]; cards: Cards; kind: 'yojo' | 'sweet'; height?: number }) {
  const counts = [1, 2, 3, 4, 5, 6, 7].map(cost => ids.filter(id => Math.min(7, Math.max(1, cards.byId.get(id)?.cost ?? 1)) === cost).length);
  const tallest = Math.max(3, ...counts);
  return <div className={styles.curve} data-kind={kind} style={{ '--bar': `${height}px` } as React.CSSProperties} aria-hidden="true">
    {counts.map((count, index) => <span key={index}><em>{count || ''}</em><i style={{ height: `${count / tallest * height}px` }} /><b>{index === 6 ? '7+' : index + 1}</b></span>)}
  </div>;
}

export const fruitColors: Record<Fruit, string> = { strawberry: '#ef6f8c', grape: '#9a6bd1', melon: '#7da552', orange: '#f0a04b' };
/** The fruits a deck's 幼女 and お菓子 use, in the game's order. */
export const fruitsOfDeck = (ids: string[], cards: Cards): Fruit[] => fruitOrder.filter(fruit => ids.some(id => cards.byId.get(id)?.fruit === fruit));

export function FruitChips({ fruits }: { fruits: Fruit[] }) {
  const { fruitLabel } = useI18n();
  return <>{fruits.map(fruit => <span key={fruit} className={styles.chip}><i className={styles.dot} style={{ background: fruitColors[fruit] }} />{fruitLabel(fruit)}</span>)}</>;
}

/** Sorted as the deck shows them: by cost, then by card number. */
export const byCost = (cards: Cards) => (a: string, b: string) => (cards.byId.get(a)?.cost ?? 0) - (cards.byId.get(b)?.cost ?? 0) || a.localeCompare(b, 'ja', { numeric: true });
