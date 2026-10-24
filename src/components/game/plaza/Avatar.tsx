'use client';
import { RecordedCard } from '../history/RecordedCard';
import { PlazaIcon } from './PlazaIcon';
import styles from './Plaza.module.css';

/** A round portrait: the card a member chose for their profile (a guest's is chosen for them), or the CPU. */
export function Avatar({ card, cpu, size = 56, dim }: { card?: string; cpu?: boolean; size?: number; dim?: boolean }) {
  return <span className={styles.avatar} data-cpu={cpu || undefined} data-dim={dim || undefined} style={{ width: size, height: size }} aria-hidden="true">
    {cpu ? <PlazaIcon name="cpu" /> : <RecordedCard id={card ?? 'p_1'} sizes={`${size * 2}px`} />}
  </span>;
}
