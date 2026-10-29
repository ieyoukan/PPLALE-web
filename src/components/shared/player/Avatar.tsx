'use client';
import Image from 'next/image';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './Avatar.module.css';

export interface AvatarIdentity { card?: string; cpu?: boolean }

/** プレイヤーの丸いアイコン。デッキやカード本体の表示には使わない。 */
export function Avatar({ card, cpu, size = 56, dim }: AvatarIdentity & { size?: number; dim?: boolean }) {
  return <span className={styles.avatar} data-player-avatar data-cpu={cpu || undefined} data-dim={dim || undefined} style={{ height: size, width: size }} aria-hidden="true">
    {cpu ? <><Image src="/images/back-card.webp" alt="" fill sizes={`${size}px`} /><GameIcon name="cpu" /></> : <CardArtwork id={card ?? 'p_1'} sizes={`${size * 2}px`} />}
  </span>;
}
