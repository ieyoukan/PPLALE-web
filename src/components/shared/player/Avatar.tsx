'use client';
import Image from 'next/image';
import { RecordedCard } from '@/components/game/history/RecordedCard';
import { PlazaIcon } from '@/components/game/plaza/PlazaIcon';
import styles from './Avatar.module.css';

export interface AvatarIdentity { card?: string; cpu?: boolean }

/** A compact player portrait; deck and collectible cards keep their printed proportions. */
export function Avatar({ card, cpu, size = 56, dim }: AvatarIdentity & { size?: number; dim?: boolean }) {
  return <span className={styles.avatar} data-player-avatar data-cpu={cpu || undefined} data-dim={dim || undefined} style={{ height: size, width: size }} aria-hidden="true">
    {cpu ? <><Image src="/images/back-card.webp" alt="" fill sizes={`${size}px`} /><PlazaIcon name="cpu" /></> : <RecordedCard id={card ?? 'p_1'} sizes={`${size * 2}px`} />}
  </span>;
}
