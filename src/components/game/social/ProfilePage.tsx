'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import type { RoomInfo } from '@pplale/game-core/room';
import { lookupRooms } from '@/lib/game/room/client';
import { defaultProfile, readFriendRooms, readFriendship, readProfile, requestFriend, saveProfile } from '@/lib/game/social';
import type { Friendship, PlayerProfile } from '@/lib/game/social';
import { RecordedCard } from '../history/RecordedCard';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { Icon } from './Icon';
import { locate } from './location';
import { NOTIFICATIONS_PATH } from './NotificationsPage';
import { DeckChooser, PublicDecks } from './ProfileDecks';
import { RoomCard } from './RoomCard';
import { useMarkOwnProfileOpen } from './ownProfile';
import { ProfileIconPicker } from './ProfileIconPicker';
import styles from './Social.module.css';

/** `id`: whose profile (the launchpad's place); without it, the address's `?id=`, or the player's own. */
export function ProfilePage({ id }: { id?: string }) {
  const { user, loading, signInWithGoogle } = useAuth();
  const params = useSearchParams();
  const requested = id ?? params.get('id'), uid = requested ?? user?.uid;
  useMarkOwnProfileOpen(!requested || requested === user?.uid);
  // A shared profile link (?id=) renders without waiting for the visitor's login check.
  if (!uid && loading) return <p role="status">読み込み中…</p>;
  if (!uid) return <section className={`${styles.panel} ${styles.signIn}`}><Icon name="pen" className={styles.signInIcon} /><p>ログインして、カードのアイコンとひとことを設定しよう。</p><OrnateFrame as="button" size="sm" className={styles.cardButton} onClick={() => void signInWithGoogle()}><Icon name="heart" /><span data-ui-title>ログイン</span></OrnateFrame></section>;
  return <Profile key={`${uid}:${uid === user?.uid}`} uid={uid} mine={uid === user?.uid} />;
}
function Profile({ uid, mine }: { uid: string; mine: boolean }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [firstProfile, setFirstProfile] = useState(false);
  const [friendSent, setFriendSent] = useState(false), [friendship, setFriendship] = useState<Friendship | null>(null);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    let current = true;
    void readProfile(uid).then(value => { if (current) { setProfile(value ?? (mine ? defaultProfile(uid, '') : null)); setFirstProfile(mine && !value); setLoading(false); } }, () => { if (current) { setError('プロフィールを読み込めませんでした'); setLoading(false); } });
    return () => { current = false; };
  }, [uid, mine, readAttempt]);
  // Someone who is already a friend (or asked, or was asked) is not offered a request.
  useEffect(() => {
    if (mine || !user) return;
    let current = true;
    void readFriendship(uid).then(value => { if (current) setFriendship(value); }, () => {});
    return () => { current = false; };
  }, [uid, mine, user]);
  if (loading) return <p role="status">プロフィールを読み込み中…</p>;
  if (!profile) return <section className={`${styles.panel} ${styles.signIn}`}><p role="status">{error || 'プロフィールはまだ作成されていません。'}</p>{error && <button className={styles.primary} onClick={() => { setLoading(true); setError(''); setReadAttempt(value => value + 1); }}>もう一度読み込む</button>}</section>;
  async function save() {
    if (!profile || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { setProfile(await saveProfile(profile)); setFirstProfile(false); setMessage('保存しました'); window.dispatchEvent(new Event('pplale-profile-updated')); }
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
    <header className={styles.profileHeading}>
      <button className={styles.avatarLarge} disabled={!mine} onClick={() => setChoosing(value => !value)} aria-label="カードのアイコンを選ぶ"><RecordedCard id={profile.iconCardId} sizes="120px" eager />{mine && <span>変更 <Icon name="pen" /></span>}</button>
      <div><small>PLAYER PROFILE</small><h3 data-ui-title>{firstProfile ? 'はじめまして！' : profile.displayName}</h3><p className={styles.comment}>{firstProfile ? 'みんなに見える名前を決めよう' : profile.comment || 'よろしくお願いします！'}</p></div>
    </header>
    {!mine && friendship?.status === 'accepted' && <FriendRoom uid={uid} profile={profile} />}
    {!mine && <PublicDecks uid={uid} ids={profile.decks} />}
    {mine && <form onSubmit={event => { event.preventDefault(); void save(); }} className={styles.profileForm}>
      <label>なまえ<input value={profile.displayName} maxLength={12} required autoComplete="nickname" placeholder="ニックネーム" onChange={event => setProfile({ ...profile, displayName: event.target.value })} /></label>
      <label>ひとこと<input aria-label="ひとこと" value={profile.comment} maxLength={80} placeholder="よろしくお願いします！" onChange={event => setProfile({ ...profile, comment: event.target.value })} /><small>{Array.from(profile.comment).length} / 80</small></label>
      {choosing && <ProfileIconPicker selected={profile.iconCardId} onSelect={iconCardId => { setProfile({ ...profile, iconCardId }); setChoosing(false); }} />}
      <DeckChooser uid={uid} chosen={profile.decks} onChange={decks => setProfile({ ...profile, decks })} />
      <OrnateFrame as="button" size="sm" className={styles.cardButton} disabled={busy || !profile.displayName.trim()}><Icon name="check" /><span data-ui-title>{busy ? '保存中…' : 'プロフィールを保存'}</span></OrnateFrame>
    </form>}
    <div className={styles.actions}>
      {!mine && user && (friendship?.status === 'accepted' ? <span className={styles.friendChip}><Icon name="heart" />フレンド</span>
        : friendship && friendship.requestedBy !== user.uid ? <Link className={styles.primary} href={NOTIFICATIONS_PATH}>届いた申請を見る ›</Link>
        : <OrnateFrame as="button" size="sm" className={styles.cardButton} disabled={busy || friendSent || !!friendship} onClick={() => void friend()}><span data-ui-title>{friendship ? '申請中' : '＋ フレンド申請'}</span></OrnateFrame>)}
      <button onClick={() => void share()}><Icon name="send" />リンクをコピー</button>
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
      const rooms = Object.fromEntries((ids.length ? (await lookupRooms(ids).catch(() => ({ rooms: [] }))).rooms : []).map(room => [room.id, room]));
      if (current) setFound(locate({ profile, ...said }, rooms, Date.now())?.room ?? null);
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [uid, profile]);
  return found && <section className={styles.where} aria-label="いまいるルーム"><RoomCard room={found} large /></section>;
}
