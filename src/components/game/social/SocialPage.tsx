'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import type { Friendship, SocialPlayer } from '@/lib/game/social';
import type { RoomInfo } from '@pplale/game-core/room';
import { lookupRooms } from '@/lib/game/room/client';
import { RecordedCard } from '../history/RecordedCard';
import { FriendTile } from './FriendTile';
import { Icon } from './Icon';
import { locate, placeLabel, placeOf, placeOrder } from './location';
import { NOTIFICATIONS_PATH } from './NotificationsPage';
import { RoomCard } from './RoomCard';
import { Invitations } from './Invitations';
import { useMyProfile } from './useMyProfile';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

/** A friend in a room: its host, or someone watching it. */
interface Member { player: SocialPlayer; role: 'host' | 'watching' }
interface Group { room: RoomInfo; members: Member[] }

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
      // One request for every room; the server leaves out those this player may not enter.
      const found = roomIds ? await lookupRooms(roomIds.split(',')).then(result => result.rooms, () => null) : [];
      if (current && found) { setRooms(Object.fromEntries(found.map(room => [room.id, room]))); setNow(Date.now()); }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [roomIds]);
  const groups = new Map<string, Group>(), elsewhere: SocialPlayer[] = [];
  for (const player of friends) {
    const found = locate(player, rooms, now);
    if (!found) { elsewhere.push(player); continue; }
    const group = groups.get(found.room.id) ?? { room: found.room, members: [] };
    group.members.push({ player, role: found.role }); groups.set(found.room.id, group);
  }
  const ordered = [...groups.values()].sort((a, b) => placeOrder.indexOf(placeOf(a.room)) - placeOrder.indexOf(placeOf(b.room)) || a.room.id.localeCompare(b.room.id));
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
    <Invitations />
    {!friends.length && <div className={styles.empty} role="status"><Icon name="heart" /><p>{loading ? '読み込み中…' : 'プロフィールのリンクから、フレンドになろう。'}</p>{!loading && <Link className={styles.primary} href={NOTIFICATIONS_PATH}><Icon name="add" />フレンドを追加</Link>}</div>}
    {ordered.map(({ room, members }) => {
      const place = placeOf(room);
      return <details key={room.id} className={styles.group} data-place={place} open>
        <summary><span className={styles.chevron} aria-hidden="true" />{room.plaza?.name ?? `${room.host}のルーム`}<span className={styles.placeChip}>{placeLabel[place]}</span></summary>
        <div className={styles.groupBody}>
          <RoomCard room={room} />
          <div className={styles.tiles}>{members.map(({ player, role }) => role === 'host' ? tile(player, place, placeLabel[place]) : tile(player, 'watching', '観戦中'))}</div>
        </div>
      </details>;
    })}
    {elsewhere.length > 0 && <div className={`${styles.tiles} ${styles.elsewhere}`}>{elsewhere.map(player => tile(player, 'away', ''))}</div>}
  </section>;
}
