'use client';

import type { MouseEvent } from 'react';
import { DECK_IMAGE_WIDTH, DECK_IMAGE_HEIGHT, DECK_IMAGE_ASPECT, deckImageLayout } from '@/lib/deckImageLayout';
import type { DeckImageCards } from '@/lib/deckImageLayout';
import styles from './DeckCardLayout.module.css';

/** 大きさにかかわらず同じカード配置を使う。指定した場合だけ、各カードを拡大するボタンにする。 */
export function DeckCardLayout({ deck, label, imageOf, nameOf, onCardClick }: {
  deck: DeckImageCards;
  label: string;
  imageOf: (id: string) => string | undefined;
  nameOf?: (id: string) => string;
  onCardClick?: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const slots = deckImageLayout(deck);
  return <div className={styles.layout} style={{ aspectRatio: DECK_IMAGE_ASPECT }} role={onCardClick ? 'group' : undefined} aria-label={onCardClick ? label : undefined}>
    <svg viewBox={`0 0 ${DECK_IMAGE_WIDTH} ${DECK_IMAGE_HEIGHT}`} role={onCardClick ? undefined : 'img'} aria-label={onCardClick ? undefined : label} aria-hidden={!!onCardClick || undefined} className={styles.image}>
      {slots.map((slot, i) => <g key={i}>
        {slot.kind !== 'playable' && <rect x={slot.left} y={slot.top} width={slot.width} height={slot.height} fill="var(--brand-blush)" />}
        {slot.id && imageOf(slot.id) && <image href={imageOf(slot.id)} x={slot.left} y={slot.top} width={slot.width} height={slot.height} preserveAspectRatio="none" />}
      </g>)}
    </svg>
    {onCardClick && slots.map((slot, i) => slot.id && <button key={i} type="button" className={styles.card} data-deck-card={slot.id} data-kind={slot.kind} aria-label={nameOf?.(slot.id) ?? slot.id} aria-haspopup="dialog"
      style={{ left: `${slot.left / DECK_IMAGE_WIDTH * 100}%`, top: `${slot.top / DECK_IMAGE_HEIGHT * 100}%`, width: `${slot.width / DECK_IMAGE_WIDTH * 100}%`, height: `${slot.height / DECK_IMAGE_HEIGHT * 100}%` }} onClick={event => onCardClick(slot.id!, event)} />)}
  </div>;
}
