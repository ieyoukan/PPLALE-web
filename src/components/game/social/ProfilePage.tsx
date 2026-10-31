'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { defaultProfile, readFriendship, readProfile, requestFriend, respondFriend, saveProfile } from '@/lib/game/social';
import type { Friendship, PlayerProfile } from '@/lib/game/social';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { GuestSignInPrompt } from '@/components/shared/auth/GuestSignInPrompt';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { Avatar } from '@/components/shared/player/Avatar';
import { guestIcon } from '@/components/shared/player/useProfiles';
import { usePlaza } from '../plaza/PlazaProvider';
import { InviteToRoom } from './InviteToRoom';
import { ProfileWhere } from './ProfileWhere';
import { NOTIFICATIONS_PATH } from './NotificationsPage';
import { DeckChooser, PublicDecks } from './ProfileDecks';
import { useMarkOwnProfileOpen } from './ownProfile';
import { ProfileIconPicker } from './ProfileIconPicker';
import { ProfileShare } from './ProfileShare';
import { useMyProfileState } from './useMyProfile';
import styles from './Social.module.css';

/** `id`: whose profile (the launchpad's place); without it, the address's `?id=`, or the player's own. */
export function ProfilePage({ id }: { id?: string }) {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const requested = id ?? params.get('id'), uid = requested ?? user?.uid;
  useMarkOwnProfileOpen(!requested || requested === user?.uid);
  // A shared profile link (?id=) renders without waiting for the visitor's login check.
  if (!uid && loading) return <p role="status">読み込み中…</p>;
  if (!uid) return <section className={styles.panel} aria-label="プロフィール"><GuestSignInPrompt purpose="profile" /></section>;
  return <Profile key={`${uid}:${uid === user?.uid}`} uid={uid} mine={uid === user?.uid} />;
}
function Profile({ uid, mine }: { uid: string; mine: boolean }) {
  const { user, signInWithGoogle } = useAuth();
  const me = useMyProfileState(!mine);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [firstProfile, setFirstProfile] = useState(false);
  // `undefined` until this player's friendship with them has been read.
  const [friendSent, setFriendSent] = useState(false), [friendship, setFriendship] = useState<Friendship | null | undefined>(undefined);
  // Asked to befriend them before being able to (signed out, or no profile yet): sent once both are done.
  const [wanted, setWanted] = useState(false), signingIn = useRef(false);
  const [choosing, setChoosing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
  const ready = wanted && !!user && !!me.profile && friendship === null && !busy;
  useEffect(() => {
    if (!ready) return;
    setWanted(false);
    void friend();
    // friend() reads only state the condition above already settled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
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
  async function removeFriend() {
    if (!friendship || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await respondFriend(friendship, false); setFriendship(null); setFriendSent(false); setConfirmRemove(false); setMessage('フレンドから外しました'); }
    catch { setError('変更できませんでした。もう一度お試しください'); }
    finally { setBusy(false); }
  }
  async function befriend() {
    if (user) { if (me.profile) void friend(); else setWanted(true); return; }
    if (signingIn.current) return;
    signingIn.current = true; setBusy(true); setError(''); setWanted(true);
    // A first sign-in shows the profile setup over this page; the request goes once it is saved.
    try { await signInWithGoogle(); }
    catch { setWanted(false); setError('ログインできませんでした。もう一度お試しください'); }
    finally { signingIn.current = false; setBusy(false); }
  }
  return <section className={styles.panel} aria-label="プロフィール">
    <div className={styles.profileLayout}>
      <div className={styles.profileMain}>
        <header className={styles.profileHeading}>
          <button className={styles.avatarLarge} disabled={!mine} onClick={() => setChoosing(value => !value)} aria-label="カードのアイコンを選ぶ"><CardArtwork id={profile.iconCardId} sizes="120px" eager />{mine && <span>変更 <GameIcon name="pen" /></span>}</button>
          <div><small>PLAYER PROFILE</small><h3 data-ui-title>{firstProfile ? 'はじめまして！' : profile.displayName}</h3><p className={styles.comment}>{firstProfile ? 'みんなに見える名前を決めよう' : profile.comment || 'よろしくお願いします！'}</p>
            {!firstProfile && <ProfileShare uid={uid} name={profile.displayName} mine={mine} />}</div>
        </header>
        {!mine && !user && <Befriend card={profile.iconCardId} name={profile.displayName} busy={busy || wanted} onClick={() => void befriend()} />}
        {mine && <form onSubmit={event => { event.preventDefault(); void save(); }} className={styles.profileForm}>
          <label>なまえ<input value={profile.displayName} maxLength={12} required autoComplete="nickname" placeholder="ニックネーム" onChange={event => setProfile({ ...profile, displayName: event.target.value })} /></label>
          <label>ひとこと<input aria-label="ひとこと" value={profile.comment} maxLength={80} placeholder="よろしくお願いします！" onChange={event => setProfile({ ...profile, comment: event.target.value })} /><small>{Array.from(profile.comment).length} / 80</small></label>
          <label className={styles.toggle}><input type="checkbox" checked={profile.searchable ?? true} onChange={event => setProfile({ ...profile, searchable: event.target.checked })} /><GameIcon name="search" />なまえ検索に表示する</label>
          {choosing && <ProfileIconPicker selected={profile.iconCardId} onSelect={iconCardId => { setProfile({ ...profile, iconCardId }); setChoosing(false); }} />}
          <DeckChooser uid={uid} chosen={profile.decks} onChange={decks => setProfile({ ...profile, decks })} />
          <OrnateFrame as="button" size="line" className={styles.cardButton} disabled={busy || !profile.displayName.trim()}><GameIcon name="check" /><span data-ui-title>{busy ? '保存中…' : 'プロフィールを保存'}</span></OrnateFrame>
        </form>}
        <div className={styles.actions}>
          {!mine && user && (friendship?.status === 'accepted' ? <span className={styles.friendChip}><GameIcon name="heart" />フレンド</span>
            : friendship && friendship.requestedBy !== user.uid ? <Link className={styles.primary} href={NOTIFICATIONS_PATH}>届いた申請を見る ›</Link>
            : <OrnateFrame as="button" size="line" className={styles.cardButton} disabled={busy || wanted || friendSent || !!friendship} onClick={() => void befriend()}><span data-ui-title>{friendship || friendSent ? '申請中' : wanted ? '申請中…' : '＋ フレンド申請'}</span></OrnateFrame>)}
          {!mine && user && friendship?.status === 'accepted' && <>
            <InviteToRoom uid={uid} name={profile.displayName} />
            {confirmRemove ? <div className={styles.friendConfirm} role="group" aria-label="フレンド解除の確認">
              <span>{profile.displayName}をフレンドから外しますか？</span>
              <button disabled={busy} onClick={() => void removeFriend()}>外す</button>
              <button disabled={busy} onClick={() => setConfirmRemove(false)}>やめる</button>
            </div> : <button disabled={busy} onClick={() => setConfirmRemove(true)}>フレンドから外す</button>}
          </>}
        </div>
        {!mine && <PublicDecks uid={uid} ids={profile.decks} />}
        {message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <ProfileWhere uid={uid} name={profile.displayName} mine={mine} canRead={mine || friendship?.status === 'accepted'} />
    </div>
  </section>;
}

/** For a visitor who is not signed in: their face and the visitor's, and one button to sign in and ask. */
function Befriend({ card, name, busy, onClick }: { card: string; name: string; busy: boolean; onClick: () => void }) {
  // The visitor's own guest face in the room (the room's way of telling guests apart), or a blank one outside a room.
  const me = usePlaza().view?.plaza?.me;
  return <section className={styles.befriend} aria-label={`${name}とフレンドになる`}>
    <span className={styles.pair} aria-hidden="true"><Avatar card={card} size={64} /><GameIcon name="heart" className={styles.pairHeart} />{me ? <Avatar card={guestIcon(me)} size={64} /> : <span className={styles.blankFace}><GameIcon name="people" /></span>}</span>
    <OrnateFrame as="button" size="line" className={styles.cardButton} disabled={busy} onClick={onClick}><GameIcon name="heart" /><span data-ui-title>{busy ? 'ログイン中…' : 'ログインしてフレンドになる'}</span></OrnateFrame>
    <ul className={styles.perks}>
      <li><GameIcon name="pin" />いまいるルーム</li>
      <li><GameIcon name="letter" />招待</li>
      <li><GameIcon name="people" />いっしょに対戦</li>
    </ul>
  </section>;
}
