'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PlayerProfile } from '@/lib/game/social';
import { RecordedCard } from '../history/RecordedCard';
import { AskToEnter } from './AskToEnter';
import { Icon } from './Icon';
import styles from './Social.module.css';

/** A friend: icon, name and ひとこと on a ribbon showing their card. `place` colours it (Social.module.css `data-place`). */
export function FriendTile({ profile, place, status, children }: { profile: PlayerProfile; place: string; status: string; children?: ReactNode }) {
  return <article className={styles.tile} data-place={place}>
    <span className={styles.tileArt} aria-hidden="true"><RecordedCard id={profile.iconCardId} sizes="160px" /></span>
    <Link className={styles.tileLink} href={`/game/profile/?id=${encodeURIComponent(profile.uid)}`}>
      <span className={styles.avatar}><RecordedCard id={profile.iconCardId} sizes="56px" /></span>
      <span className={styles.tileText}><b>{profile.displayName}</b>{(profile.comment || status) && <small>{status && (place === 'watching' ? <span className={styles.watchMark} role="img" aria-label={status}><Icon name="eye" /></span> : <i className={styles.dot} aria-label={status} />)}<span>{profile.comment || status}</span></small>}</span>
    </Link>
    {/* Not in a room friends can find: they may still be in an invited one. */}
    {place === 'away' && <AskToEnter uid={profile.uid} name={profile.displayName} />}
    {children}
  </article>;
}
