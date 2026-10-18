'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import type { Friendship, SocialPlayer } from '@/lib/game/social';
import { fruitNames } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { readRoomInfo } from '@/lib/game/room/client';
import { roomHref, ROOM_PATH, watchHref } from '@/lib/game/sessionStore';
import { RecordedCard } from '../history/RecordedCard';
import { fruitArt } from '../RulePicker';
import { FriendTile } from './FriendTile';
import { NOTIFICATIONS_PATH } from './NotificationsPage';
import { useMyProfile } from './useMyProfile';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

/** Where a friend is: recruiting in a room, in a match that may be watched, getting a room ready, or nowhere we know of. */
type Place = 'open' | 'playing' | 'lobby' | 'away';
const placeOrder: Place[] = ['open', 'playing', 'lobby', 'away'];
const placeLabel: Record<Place, string> = { open: '募集中', playing: '対戦中', lobby: '準備中', away: '募集なし' };
interface Group { key: string; place: Place; room?: RoomInfo; players: SocialPlayer[] }

export function SocialPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  if (loading) return <p role="status">読み込み中…</p>;
  if (!user) return <section className={styles.panel}><h2>フレンドと遊ぼう</h2><p>プロフィールを作って、フレンドの募集に参加しよう。</p><button className={styles.primary} onClick={() => void signInWithGoogle()}>ログイン</button></section>;
  return <Social key={user.uid} uid={user.uid} />;
}
function Social({ uid }: { uid: string }) {
  const me = useMyProfile();
  const { friends, received, error, loading, busy, respond } = useSocial(uid);
  const [rooms, setRooms] = useState<Record<string, RoomInfo>>({});
  const [remove, setRemove] = useState<Friendship | null>(null);
  const roomIds = [...new Set(friends.flatMap(player => player.roomId ? [player.roomId] : []))].sort().join(',');
  useEffect(() => {
    let current = true;
    async function refresh() {
      if (document.hidden) return;
      const entries = await Promise.all(roomIds.split(',').filter(Boolean).map(async id => { try { return [id, await readRoomInfo(id)] as const; } catch { return null; } }));
      if (current) setRooms(Object.fromEntries(entries.filter(entry => entry !== null)));
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [roomIds]);
  // A room shows only while the friend who published it is its connected host.
  const groups = new Map<string, Group>();
  for (const player of friends) {
    const room = player.roomId ? rooms[player.roomId] : undefined, active = room && room.hostProfileId === player.profile.uid && room.hostOnline;
    const place: Place = !active ? 'away' : room.open ? 'open' : room.spectators && room.status === 'playing' ? 'playing' : 'lobby';
    const key = active ? room.id : 'away';
    const group = groups.get(key) ?? { key, place, room: active ? room : undefined, players: [] };
    group.players.push(player); groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => placeOrder.indexOf(a.place) - placeOrder.indexOf(b.place) || a.key.localeCompare(b.key));
  return <section className={styles.panel} aria-label="ソーシャル">
    <header className={styles.socialHeading}>
      <h2><span aria-hidden="true">♡</span>フレンドの現在地<em>{friends.length}</em></h2>
      <span className={styles.headingLinks}>
        <Link className={styles.bell} href={NOTIFICATIONS_PATH} aria-label={`通知${received.length ? ` ${received.length}件` : ''}`}><span aria-hidden="true">🔔</span>{received.length > 0 && <em className={styles.badge}>{received.length}</em>}</Link>
        <Link className={styles.me} href="/game/profile/" aria-label="マイプロフィール">
          <span className={styles.avatar}>{me && <RecordedCard id={me.iconCardId} sizes="40px" />}</span><span>{me?.displayName ?? 'マイプロフィール'}</span><i aria-hidden="true">✎</i>
        </Link>
      </span>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!friends.length && <div className={styles.empty} role="status"><span aria-hidden="true">♡</span><p>{loading ? '読み込み中…' : 'プロフィールのリンクから、フレンドになろう。'}</p>{!loading && <Link className={styles.primary} href={NOTIFICATIONS_PATH}>＋♡ フレンドを追加</Link>}</div>}
    {ordered.map(({ key, place, room, players: members }) => {
      const href = room && (place === 'open' ? roomHref(ROOM_PATH, room.id) : place === 'playing' ? watchHref(room.id) : undefined);
      const host = members[0].profile;
      const card = <>
        <span className={styles.roomArt} aria-hidden="true">{room
          ? room.rules.fruits.map(fruit => <span key={fruit} style={{ background: fruitArt[fruit].tone }}><Image src={fruitArt[fruit].image} alt="" fill sizes="120px" /></span>)
          : <span className={styles.sleep}>☾</span>}</span>
        <span className={styles.roomBadge}>{placeLabel[place]}</span>
        {href && <span className={styles.roomAction}>{place === 'open' ? '▶ 参加' : '👁 観戦'}</span>}
        <span className={styles.roomInfo}>
          {room ? <><b>#{room.id}</b><span className={styles.fruitDots}>{room.rules.fruits.map(fruit => <i key={fruit} title={fruitNames[fruit]} style={{ background: fruitArt[fruit].tone }} />)}</span></> : <b>おやすみ中</b>}
          <span className={styles.count} aria-label={`フレンド${members.length}人`}>👥 {members.length}</span>
        </span>
      </>;
      return <details key={key} className={styles.group} data-place={place} open={place !== 'away' || ordered.length < 3}>
        <summary><span className={styles.chevron} aria-hidden="true" />{room ? `${host.displayName}のルーム` : 'ほかのフレンド'}<span className={styles.placeChip}>{placeLabel[place]}</span></summary>
        <div className={styles.groupBody}>
          {href ? <Link className={styles.room} href={href} aria-label={`${host.displayName}のルーム: ${place === 'open' ? '参加する' : '観戦する'}`}>{card}</Link> : <div className={styles.room}>{card}</div>}
          <div className={styles.tiles}>{members.map(({ profile, friendship }) => <FriendTile key={friendship.id} profile={profile} place={place} status={placeLabel[place]}>
            <button className={styles.more} aria-label={`${profile.displayName}をフレンドから外す`} onClick={() => setRemove(friendship)}>…</button>
            {remove?.id === friendship.id && <div className={styles.remove} role="dialog" aria-label="フレンドから外す">
              <span className={styles.removeIcon} aria-hidden="true">💔</span>
              <button disabled={!!busy} onClick={() => void respond(friendship, false).then(done => { if (done) setRemove(null); })}>外す</button><button onClick={() => setRemove(null)}>やめる</button>
            </div>}
          </FriendTile>)}</div>
        </div>
      </details>;
    })}
  </section>;
}
