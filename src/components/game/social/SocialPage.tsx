'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { WATCHING_STALE } from '@/lib/game/social';
import type { Friendship, SocialPlayer } from '@/lib/game/social';
import { fruitNames } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { readRoomInfo } from '@/lib/game/room/client';
import { roomHref, ROOM_PATH, watchHref } from '@/lib/game/sessionStore';
import { RecordedCard } from '../history/RecordedCard';
import { fruitArt } from '../RulePicker';
import { FriendTile } from './FriendTile';
import { Icon } from './Icon';
import { NOTIFICATIONS_PATH } from './NotificationsPage';
import { useMyProfile } from './useMyProfile';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

/** What a room is doing: recruiting, a match that may be watched, or getting ready. */
type Place = 'open' | 'playing' | 'lobby';
const placeOrder: Place[] = ['open', 'playing', 'lobby'];
const placeLabel: Record<Place, string> = { open: '募集中', playing: '対戦中', lobby: '準備中' };
/** A friend in a room: its host, or someone watching it. */
interface Member { player: SocialPlayer; role: 'host' | 'watching' }
interface Group { room: RoomInfo; place: Place; members: Member[] }

export function SocialPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  if (loading) return <p role="status">読み込み中…</p>;
  if (!user) return <section className={styles.panel}><h2>フレンドと遊ぼう</h2><p>プロフィールを作って、フレンドの募集に参加しよう。</p><button className={styles.primary} onClick={() => void signInWithGoogle()}>ログイン</button></section>;
  return <Social key={user.uid} uid={user.uid} />;
}
function Social({ uid }: { uid: string }) {
  const me = useMyProfile();
  const { friends, received, error, loading, busy, respond } = useSocial(uid);
  const [rooms, setRooms] = useState<Record<string, RoomInfo>>({}), [now, setNow] = useState(() => Date.now());
  const [remove, setRemove] = useState<Friendship | null>(null);
  const roomIds = [...new Set(friends.flatMap(player => [player.roomId, player.watching?.roomId].filter((id): id is string => !!id)))].sort().join(',');
  useEffect(() => {
    let current = true;
    async function refresh() {
      if (document.hidden) return;
      const entries = await Promise.all(roomIds.split(',').filter(Boolean).map(async id => { try { return [id, await readRoomInfo(id)] as const; } catch { return null; } }));
      if (current) { setRooms(Object.fromEntries(entries.filter(entry => entry !== null))); setNow(Date.now()); }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [roomIds]);
  // A room shows while the friend who published it is its connected host; a spectator, while they keep saying so and the match can still be watched.
  const groups = new Map<string, Group>(), elsewhere: SocialPlayer[] = [];
  const join = (room: RoomInfo, member: Member) => {
    const place: Place = room.open ? 'open' : room.spectators && room.status === 'playing' ? 'playing' : 'lobby';
    const group = groups.get(room.id) ?? { room, place, members: [] };
    group.members.push(member); groups.set(room.id, group);
  };
  for (const player of friends) {
    const hosted = player.roomId ? rooms[player.roomId] : undefined, watched = player.watching ? rooms[player.watching.roomId] : undefined;
    if (hosted && hosted.hostProfileId === player.profile.uid && hosted.hostOnline) join(hosted, { player, role: 'host' });
    else if (watched && watched.spectators && watched.status === 'playing' && now - player.watching!.at < WATCHING_STALE) join(watched, { player, role: 'watching' });
    else elsewhere.push(player);
  }
  const ordered = [...groups.values()].sort((a, b) => placeOrder.indexOf(a.place) - placeOrder.indexOf(b.place) || a.room.id.localeCompare(b.room.id));
  const tile = ({ profile, friendship }: SocialPlayer, place: string, status: string) => <FriendTile key={friendship.id} profile={profile} place={place} status={status}>
    <button className={styles.more} aria-label={`${profile.displayName}をフレンドから外す`} onClick={() => setRemove(friendship)}><Icon name="more" /></button>
    {remove?.id === friendship.id && <div className={styles.remove} role="dialog" aria-label="フレンドから外す">
      <button disabled={!!busy} onClick={() => void respond(friendship, false).then(done => { if (done) setRemove(null); })}>外す</button><button onClick={() => setRemove(null)}>やめる</button>
    </div>}
  </FriendTile>;
  return <section className={styles.panel} aria-label="ソーシャル">
    <header className={styles.socialHeading}>
      <h2><Icon name="heart" className={styles.beat} />フレンドの現在地<em>{friends.length}</em></h2>
      <span className={styles.headingLinks}>
        <Link className={styles.bell} href={NOTIFICATIONS_PATH} aria-label={`通知${received.length ? ` ${received.length}件` : ''}`}><Icon name="bell" />{received.length > 0 && <em className={styles.badge}>{received.length}</em>}</Link>
        <Link className={styles.me} href="/game/profile/" aria-label="マイプロフィール">
          <span className={styles.avatar}>{me && <RecordedCard id={me.iconCardId} sizes="40px" />}</span><span>{me?.displayName ?? 'マイプロフィール'}</span><Icon name="pen" />
        </Link>
      </span>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!friends.length && <div className={styles.empty} role="status"><Icon name="heart" /><p>{loading ? '読み込み中…' : 'プロフィールのリンクから、フレンドになろう。'}</p>{!loading && <Link className={styles.primary} href={NOTIFICATIONS_PATH}><Icon name="add" />フレンドを追加</Link>}</div>}
    {ordered.map(({ room, place, members }) => {
      const href = place === 'open' ? roomHref(ROOM_PATH, room.id) : place === 'playing' ? watchHref(room.id) : undefined;
      const card = <>
        <span className={styles.roomArt} aria-hidden="true">{room.rules.fruits.map(fruit => <span key={fruit} style={{ background: fruitArt[fruit].tone }}><Image src={fruitArt[fruit].image} alt="" fill sizes="120px" /></span>)}</span>
        <span className={styles.roomBadge}>{placeLabel[place]}</span>
        {href && <span className={styles.roomAction}><Icon name={place === 'open' ? 'play' : 'eye'} />{place === 'open' ? '参加' : '観戦'}</span>}
        <span className={styles.roomInfo}><b>#{room.id}</b><span className={styles.fruitDots}>{room.rules.fruits.map(fruit => <i key={fruit} title={fruitNames[fruit]} style={{ background: fruitArt[fruit].tone }} />)}</span></span>
      </>;
      return <details key={room.id} className={styles.group} data-place={place} open>
        <summary><span className={styles.chevron} aria-hidden="true" />{room.host}のルーム<span className={styles.placeChip}>{placeLabel[place]}</span></summary>
        <div className={styles.groupBody}>
          {href ? <Link className={styles.room} href={href} aria-label={`${room.host}のルーム: ${place === 'open' ? '参加する' : '観戦する'}`}>{card}</Link> : <div className={styles.room}>{card}</div>}
          <div className={styles.tiles}>{members.map(({ player, role }) => role === 'host' ? tile(player, place, placeLabel[place]) : tile(player, 'watching', '観戦中'))}</div>
        </div>
      </details>;
    })}
    {elsewhere.length > 0 && <div className={`${styles.tiles} ${styles.elsewhere}`}>{elsewhere.map(player => tile(player, 'away', ''))}</div>}
  </section>;
}
