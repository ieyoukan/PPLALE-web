'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PlayerProfile } from '@/lib/game/social';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './Social.module.css';

/** A friend: their portrait, name and ひとこと. `place` colours its edge (Social.module.css `data-place`). */
export function FriendTile({ profile, place, status, children }: { profile: PlayerProfile; place: string; status: string; children?: ReactNode }) {
  return <article className={styles.tile} data-place={place}>
    <Link className={styles.tileLink} href={`/game/profile/?id=${encodeURIComponent(profile.uid)}`}>
      <span className={styles.avatar}><CardArtwork id={profile.iconCardId} sizes="80px" /></span>
      <span className={styles.tileText}><b>{profile.displayName}</b>{(profile.comment || status) && <small>{status && (place === 'watching' ? <span className={styles.watchMark} role="img" aria-label={status}><GameIcon name="eye" /></span> : <i className={styles.dot} aria-label={status} />)}<span>{profile.comment || status}</span></small>}</span>
    </Link>
    {children}
  </article>;
}
