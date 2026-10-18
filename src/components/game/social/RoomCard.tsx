'use client';
import Image from 'next/image';
import Link from 'next/link';
import { fruitNames } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { roomHref, ROOM_PATH, watchHref } from '@/lib/game/sessionStore';
import { fruitArt } from '../RulePicker';
import { Icon } from './Icon';
import { placeLabel, placeOf } from './location';
import styles from './Social.module.css';

/**
 * A room as a world card (as in VRChat): its rules' fruit pictures and what it is doing. Choosing it enters
 * the room when it recruits, or watches its match. `large`: the bigger card on a profile.
 */
export function RoomCard({ room, large }: { room: RoomInfo; large?: boolean }) {
  const place = placeOf(room);
  const href = place === 'open' ? roomHref(ROOM_PATH, room.id) : place === 'playing' ? watchHref(room.id) : undefined;
  const card = <>
    <span className={styles.roomArt} aria-hidden="true">{room.rules.fruits.map(fruit => <span key={fruit} style={{ background: fruitArt[fruit].tone }}><Image src={fruitArt[fruit].image} alt="" fill sizes={large ? '320px' : '120px'} /></span>)}</span>
    <span className={styles.roomBadge}>{placeLabel[place]}</span>
    {href && <span className={styles.roomAction}><Icon name={place === 'open' ? 'play' : 'eye'} />{place === 'open' ? '参加' : '観戦'}</span>}
    <span className={styles.roomInfo}>{large && <b className={styles.roomHost}>{room.host}のルーム</b>}<b>#{room.id}</b><span className={styles.fruitDots}>{room.rules.fruits.map(fruit => <i key={fruit} title={fruitNames[fruit]} style={{ background: fruitArt[fruit].tone }} />)}</span></span>
  </>;
  const className = large ? `${styles.room} ${styles.roomLarge}` : styles.room;
  return href ? <Link className={className} data-place={place} href={href} aria-label={`${room.host}のルーム: ${place === 'open' ? '参加する' : '観戦する'}`}>{card}</Link> : <div className={className} data-place={place}>{card}</div>;
}
