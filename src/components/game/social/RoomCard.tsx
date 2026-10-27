'use client';
import Link from 'next/link';
import { fruitNames } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { roomHref, watchHref } from '@/lib/game/sessionStore';
import { fruitArt, roomThumbnail } from '@/lib/game/roomThumbnail';
import { PlazaIcon } from '../plaza/PlazaIcon';
import { RoomThumbnailImage } from '../plaza/RoomThumbnailImage';
import { usePlaza } from '../plaza/PlazaProvider';
import { visibilityInfo } from '../plaza/visibility';
import { Icon } from './Icon';
import { placeLabel, placeOf } from './location';
import styles from './Social.module.css';
import own from './RoomCard.module.css';

/**
 * A room as a world card (as in VRChat): its rules' fruit pictures and what it is doing. Choosing it enters
 * the room (a room to gather in), or joins or watches a two-seat room. `large`: the bigger card on a profile.
 */
export function RoomCard({ room, large }: { room: RoomInfo; large?: boolean }) {
  const { go } = usePlaza();
  const place = placeOf(room), plaza = room.plaza, { fruits } = roomThumbnail(room.rules);
  const href = plaza ? roomHref(room.id) : place === 'open' ? roomHref(room.id) : place === 'playing' ? watchHref(room.id) : undefined;
  const title = plaza ? plaza.name : `${room.host}のルーム`;
  const verb = plaza ? '入る' : place === 'open' ? '参加' : '観戦';
  const card = <>
    <span className={styles.roomArt} aria-hidden="true"><RoomThumbnailImage rules={room.rules} sizes={large ? '420px' : '200px'} /></span>
    <span className={styles.roomBadge}>{placeLabel[place]}</span>
    {href && <span className={styles.roomAction}>{plaza ? <PlazaIcon name="enter" /> : <Icon name={place === 'open' ? 'play' : 'eye'} />}{verb}</span>}
    <span className={styles.roomInfo}>
      {(large || plaza) && <b className={styles.roomHost}>{title}</b>}
      {plaza ? <span className={own.people} title={visibilityInfo[plaza.visibility].label}><PlazaIcon name={visibilityInfo[plaza.visibility].icon} /><PlazaIcon name="people" />{plaza.members}</span> : <b>#{room.id}</b>}
      <span className={styles.fruitDots}>{fruits.map(fruit => <i key={fruit} title={fruitNames[fruit]} style={{ background: fruitArt[fruit].tone }} />)}</span>
    </span>
  </>;
  const className = large ? `${styles.room} ${styles.roomLarge}` : styles.room;
  // Entering from here keeps this screen until the room lets the player in.
  return href ? <Link className={className} data-place={place} href={href} aria-label={`${title}: ${plaza ? verb : `${verb}する`}`}
    onClick={event => { if (plaza) { event.preventDefault(); void go(room.id); } }}>{card}</Link>
    : <div className={className} data-place={place}>{card}</div>;
}
