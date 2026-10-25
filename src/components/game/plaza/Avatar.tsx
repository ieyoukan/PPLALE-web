'use client';
import Image from 'next/image';
import { RecordedCard } from '../history/RecordedCard';
import { PlazaIcon } from './PlazaIcon';
import styles from './Plaza.module.css';

/**
 * Who someone is, as a card: the whole card a member chose for their profile (a guest's is chosen
 * for them), `height` px tall at the cards' 2:3. The card is shown as printed, with no ring or
 * rounding (docs/design-system.md). The CPU has no card of its own: the back of a card, marked.
 */
export function Avatar({ card, cpu, size = 56, dim }: { card?: string; cpu?: boolean; size?: number; dim?: boolean }) {
  return <span className={styles.avatar} data-cpu={cpu || undefined} data-dim={dim || undefined} style={{ height: size, width: Math.round(size * 2 / 3) }} aria-hidden="true">
    {cpu ? <><Image src="/images/back-card.webp" alt="" fill sizes={`${size}px`} /><PlazaIcon name="cpu" /></> : <RecordedCard id={card ?? 'p_1'} sizes={`${size * 2}px`} />}
  </span>;
}
