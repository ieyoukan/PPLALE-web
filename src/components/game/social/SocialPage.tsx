'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { respondFriend, watchSocial } from '@/lib/game/social';
import type { Friendship, SocialPlayer } from '@/lib/game/social';
import type { RoomInfo } from '@pplale/game-core/room';
import { readRoomInfo } from '@/lib/game/room/client';
import { roomHref, ROOM_PATH, watchHref } from '@/lib/game/sessionStore';
import { RecordedCard } from '../history/RecordedCard';
import styles from './Social.module.css';

export function SocialPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  if (loading) return <p role="status">読み込み中…</p>;
  if (!user) return <section className={styles.panel}><h2>フレンドと遊ぼう</h2><p>プロフィールを作って、フレンドの募集に参加しよう。</p><button className={styles.primary} onClick={() => void signInWithGoogle()}>ログイン</button></section>;
  return <Social key={user.uid} uid={user.uid} />;
}
function Social({ uid }: { uid: string }) {
  const [players, setPlayers] = useState<SocialPlayer[]>([]), [tab, setTab] = useState<'friends' | 'received' | 'sent'>('friends');
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState('');
  const [rooms, setRooms] = useState<Record<string, RoomInfo>>({}), [profileLink, setProfileLink] = useState('');
  const [remove, setRemove] = useState<Friendship | null>(null);
  useEffect(() => watchSocial(uid, value => { setPlayers(value); setLoading(false); }, () => { setError('フレンドを読み込めませんでした'); setLoading(false); }), [uid]);
  const roomIds = [...new Set(players.flatMap(player => player.roomId ? [player.roomId] : []))].sort().join(',');
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
  async function respond(friendship: Friendship, accept: boolean) {
    if (busy) return;
    setBusy(friendship.id); setError('');
    try { await respondFriend(friendship, accept); setRemove(null); }
    catch { setError('変更できませんでした。もう一度お試しください'); }
    finally { setBusy(''); }
  }
  const received = players.filter(player => player.friendship.status === 'pending' && player.friendship.requestedBy !== uid);
  const visible = players.filter(player => tab === 'friends' ? player.friendship.status === 'accepted' : player.friendship.status === 'pending' && (tab === 'received' ? player.friendship.requestedBy !== uid : player.friendship.requestedBy === uid));
  let target = '';
  try { target = new URL(profileLink).searchParams.get('id') ?? ''; } catch { if (/^[\w-]{1,128}$/.test(profileLink)) target = profileLink; }
  return <section className={styles.panel} aria-label="ソーシャル">
    <header className={styles.socialHeading}><h2>ソーシャル</h2><Link href="/game/profile/">マイプロフィール ✎</Link></header>
    <nav className={styles.tabs} aria-label="フレンドの種類">{([['friends', 'フレンド'], ['received', `届いた申請${received.length ? ` ${received.length}` : ''}`], ['sent', '送った申請']] as const).map(([id, title]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{title}</button>)}</nav>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!visible.length && <div className={styles.empty} role="status"><span aria-hidden="true">{tab === 'friends' ? '♡' : '✉'}</span><p>{loading ? '読み込み中…' : tab === 'friends' ? 'プロフィールのリンクから、フレンドになろう。' : '申請はありません。'}</p></div>}
    <div className={styles.friends}>{visible.map(({ profile, friendship, roomId }) => {
      const room = roomId && rooms[roomId], active = room && room.hostProfileId === profile.uid && room.hostOnline;
      return <article key={friendship.id}>
        <Link className={styles.friendProfile} href={`/game/profile/?id=${encodeURIComponent(profile.uid)}`}><span className={styles.avatar}><RecordedCard id={profile.iconCardId} sizes="65px" /></span><div><h3>{profile.displayName}</h3><p>{profile.comment}</p></div></Link>
        {friendship.status === 'accepted' ? <div className={styles.friendActions}>
          {active && room.open ? <Link className={styles.primary} href={roomHref(ROOM_PATH, room.id)}>募集中 · 参加する ›</Link> : active && room.spectators && room.status === 'playing' ? <Link className={styles.primary} href={watchHref(room.id)}>対戦中 · 観戦する ›</Link> : <span className={styles.presence}>{active ? '準備中' : '募集はありません'}</span>}
          <button aria-label={`${profile.displayName}をフレンドから外す`} onClick={() => setRemove(friendship)}>…</button>
        </div> : <div className={styles.friendActions}>{friendship.requestedBy !== uid && <button className={styles.primary} disabled={!!busy} onClick={() => void respond(friendship, true)}>承認</button>}<button disabled={!!busy} onClick={() => void respond(friendship, false)}>{friendship.requestedBy === uid ? '取り消す' : '見送る'}</button></div>}
        {remove?.id === friendship.id && <div className={styles.remove}><p>フレンドから外しますか？</p><button disabled={!!busy} onClick={() => void respond(friendship, false)}>外す</button><button onClick={() => setRemove(null)}>やめる</button></div>}
      </article>;
    })}</div>
    <div className={styles.addFriend}><label>プロフィールのリンク<input value={profileLink} onChange={event => setProfileLink(event.target.value)} placeholder="受け取ったプロフィールのリンク" /></label>{target && <Link className={styles.primary} href={`/game/profile/?id=${encodeURIComponent(target)}`}>プロフィールを見る ›</Link>}</div>
  </section>;
}
