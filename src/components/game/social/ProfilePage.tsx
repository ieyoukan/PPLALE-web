'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { displayCards } from '@/lib/game/catalog';
import type { RoomInfo } from '@pplale/game-core/room';
import { readRoomInfo } from '@/lib/game/room/client';
import { defaultProfile, readFriendRooms, readFriendship, readProfile, requestFriend, saveProfile } from '@/lib/game/social';
import type { Friendship, PlayerProfile } from '@/lib/game/social';
import { RecordedCard } from '../history/RecordedCard';
import { Icon } from './Icon';
import { locate } from './location';
import { NOTIFICATIONS_PATH } from './NotificationsPage';
import { DeckChooser, PublicDecks } from './ProfileDecks';
import { RoomCard } from './RoomCard';
import styles from './Social.module.css';

export function ProfilePage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const requested = useSearchParams().get('id'), uid = requested ?? user?.uid;
  // A shared profile link (?id=) renders without waiting for the visitor's login check.
  if (!uid && loading) return <p role="status">読み込み中…</p>;
  if (!uid) return <section className={styles.panel}><h2>プロフィール</h2><p>ログインして、カードのアイコンとひとことを設定しよう。</p><button className={styles.primary} onClick={() => void signInWithGoogle()}>ログイン</button></section>;
  return <Profile key={`${uid}:${uid === user?.uid}`} uid={uid} mine={uid === user?.uid} />;
}
function Profile({ uid, mine }: { uid: string; mine: boolean }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [friendSent, setFriendSent] = useState(false), [friendship, setFriendship] = useState<Friendship | null>(null);
  const [query, setQuery] = useState(''), [choosing, setChoosing] = useState(false);
  useEffect(() => {
    let current = true;
    void readProfile(uid).then(value => { if (current) { setProfile(value ?? (mine ? defaultProfile(uid) : null)); setLoading(false); } }, () => { if (current) { setError('プロフィールを読み込めませんでした'); setLoading(false); } });
    return () => { current = false; };
  }, [uid, mine]);
  // Someone who is already a friend (or asked, or was asked) is not offered a request.
  useEffect(() => {
    if (mine || !user) return;
    let current = true;
    void readFriendship(uid).then(value => { if (current) setFriendship(value); }, () => {});
    return () => { current = false; };
  }, [uid, mine, user]);
  if (loading) return <p role="status">プロフィールを読み込み中…</p>;
  if (!profile) return <section className={styles.panel}><h2>プロフィール</h2><p role="status">{error || 'プロフィールはまだ作成されていません。'}</p><Link href="/game/social/">ソーシャルへ戻る</Link></section>;
  async function save() {
    if (!profile || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { setProfile(await saveProfile(profile)); setMessage('保存しました'); window.dispatchEvent(new Event('pplale-profile-updated')); }
    catch { setError('保存できませんでした。接続とログイン状態を確認してください'); }
    finally { setBusy(false); }
  }
  async function friend() {
    setBusy(true); setError('');
    try { await requestFriend(uid); setMessage('フレンド申請を送りました'); setFriendSent(true); }
    catch (failure) { setError(failure instanceof Error && !failure.message.startsWith('Missing') ? failure.message : 'マイプロフィールを保存してから申請してください'); }
    finally { setBusy(false); }
  }
  async function share() { try { await navigator.clipboard.writeText(`${location.origin}/game/profile/?id=${encodeURIComponent(uid)}`); setMessage('プロフィールのリンクをコピーしました'); } catch { setError('リンクをコピーできませんでした'); } }
  return <section className={styles.panel} aria-label="プロフィール">
    <Link className={styles.back} href="/game/social/" aria-label="ソーシャルへ戻る"><Icon name="back" /></Link>
    <header className={styles.profileHeading}>
      <button className={styles.avatarLarge} disabled={!mine} onClick={() => setChoosing(value => !value)} aria-label="カードのアイコンを選ぶ"><RecordedCard id={profile.iconCardId} sizes="120px" eager />{mine && <span>変更 <Icon name="pen" /></span>}</button>
      <div><small>PLAYER PROFILE</small><h2>{profile.displayName}</h2><p className={styles.comment}>{profile.comment || 'よろしくお願いします！'}</p></div>
    </header>
    {!mine && friendship?.status === 'accepted' && <FriendRoom uid={uid} profile={profile} />}
    {!mine && <PublicDecks uid={uid} ids={profile.decks} />}
    {mine && <form onSubmit={event => { event.preventDefault(); void save(); }} className={styles.profileForm}>
      <label>なまえ<input value={profile.displayName} maxLength={12} autoComplete="nickname" onChange={event => setProfile({ ...profile, displayName: event.target.value })} /></label>
      <label>ひとこと<input aria-label="ひとこと" value={profile.comment} maxLength={80} placeholder="よろしくお願いします！" onChange={event => setProfile({ ...profile, comment: event.target.value })} /><small>{Array.from(profile.comment).length} / 80</small></label>
      {choosing && <section className={styles.iconPicker} aria-label="アイコンのカードを選択"><input aria-label="アイコンのカードを検索" value={query} onChange={event => setQuery(event.target.value)} placeholder="カード名で検索" /><div>{Object.values(displayCards).filter(card => card.name.includes(query)).map(card => <button type="button" key={card.id} aria-label={`${card.name}をアイコンにする`} aria-pressed={profile.iconCardId === card.id} onClick={() => { setProfile({ ...profile, iconCardId: card.id }); setChoosing(false); }}><span className={styles.avatar}><RecordedCard id={card.id} sizes="65px" /></span><small>{card.name}</small></button>)}</div></section>}
      <DeckChooser uid={uid} chosen={profile.decks} onChange={decks => setProfile({ ...profile, decks })} />
      <button className={styles.primary} disabled={busy || !profile.displayName.trim()}>{busy ? '保存中…' : 'プロフィールを保存'}</button>
    </form>}
    <div className={styles.actions}>
      {!mine && user && (friendship?.status === 'accepted' ? <span className={styles.friendChip}><Icon name="heart" />フレンド</span>
        : friendship && friendship.requestedBy !== user.uid ? <Link className={styles.primary} href={NOTIFICATIONS_PATH}>届いた申請を見る ›</Link>
        : <button className={styles.primary} disabled={busy || friendSent || !!friendship} onClick={() => void friend()}>{friendship ? '申請中' : '＋ フレンド申請'}</button>)}
      <button onClick={() => void share()}>リンクをコピー</button>
    </div>
    {message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}

/** Where a friend is now, as a world card to enter (or watch) from their profile. Followed while the profile is open. */
function FriendRoom({ uid, profile }: { uid: string; profile: PlayerProfile }) {
  const [found, setFound] = useState<RoomInfo | null>(null);
  useEffect(() => {
    let current = true;
    async function refresh() {
      if (document.hidden) return;
      const said = await readFriendRooms(uid), ids = [...new Set([said.roomId, said.watching?.roomId].filter((id): id is string => !!id))];
      const rooms = Object.fromEntries((await Promise.all(ids.map(id => readRoomInfo(id).then(room => [id, room] as const, () => null)))).filter(entry => entry !== null));
      if (current) setFound(locate({ profile, ...said }, rooms, Date.now())?.room ?? null);
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [uid, profile]);
  return found && <section className={styles.where} aria-label="いまいるルーム"><RoomCard room={found} large /></section>;
}
