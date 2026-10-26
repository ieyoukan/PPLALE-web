'use client';
import Image from 'next/image';
import { RecordedCard } from '../history/RecordedCard';
import { PlazaIcon } from './PlazaIcon';
import styles from './Plaza.module.css';

/** A compact player portrait; deck and collectible cards keep their printed proportions. */
export function Avatar({ card, cpu, size = 56, dim }: { card?: string; cpu?: boolean; size?: number; dim?: boolean }) {
  return <span className={styles.avatar} data-cpu={cpu || undefined} data-dim={dim || undefined} style={{ height: size, width: size }} aria-hidden="true">
    {cpu ? <><Image src="/images/back-card.webp" alt="" fill sizes={`${size}px`} /><PlazaIcon name="cpu" /></> : <RecordedCard id={card ?? 'p_1'} sizes={`${size * 2}px`} />}
  </span>;
}
