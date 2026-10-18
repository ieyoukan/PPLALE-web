'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { displayCards } from '@/lib/game/catalog';
import { defaultProfile, readProfile, requestFriend, saveProfile } from '@/lib/game/social';
import type { PlayerProfile } from '@/lib/game/social';
import { RecordedCard } from '../history/RecordedCard';
import styles from './Social.module.css';

export function ProfilePage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const requested = useSearchParams().get('id'), uid = requested ?? user?.uid;
  if (loading) return <p role="status">読み込み中…</p>;
  if (!uid) return <section className={styles.panel}><h2>プロフィール</h2><p>ログインして、カードのアイコンとひとことを設定しよう。</p><button className={styles.primary} onClick={() => void signInWithGoogle()}>ログイン</button></section>;
  return <Profile key={`${uid}:${user?.uid ?? 'guest'}`} uid={uid} mine={uid === user?.uid} initialName={user?.displayName ?? 'プレイヤー'} />;
}
function Profile({ uid, mine, initialName }: { uid: string; mine: boolean; initialName: string }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [friendSent, setFriendSent] = useState(false);
  const [query, setQuery] = useState(''), [choosing, setChoosing] = useState(false);
  useEffect(() => {
    let current = true;
    void readProfile(uid).then(value => { if (current) { setProfile(value ?? (mine ? defaultProfile(uid, Array.from(initialName).slice(0, 12).join('')) : null)); setLoading(false); } }, () => { if (current) { setError('プロフィールを読み込めませんでした'); setLoading(false); } });
    return () => { current = false; };
  }, [uid, mine, initialName]);
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
    <header className={styles.profileHeading}>
      <button className={styles.avatarLarge} disabled={!mine} onClick={() => setChoosing(value => !value)} aria-label="カードのアイコンを選ぶ"><RecordedCard id={profile.iconCardId} sizes="120px" />{mine && <span>変更 ✎</span>}</button>
      <div><small>PLAYER PROFILE</small><h2>{profile.displayName}</h2><p className={styles.comment}>{profile.comment || 'よろしくお願いします！'}</p></div>
    </header>
    {mine && <form onSubmit={event => { event.preventDefault(); void save(); }} className={styles.profileForm}>
      <label>なまえ<input value={profile.displayName} maxLength={12} autoComplete="nickname" onChange={event => setProfile({ ...profile, displayName: event.target.value })} /></label>
      <label>ひとこと<input aria-label="ひとこと" value={profile.comment} maxLength={80} placeholder="よろしくお願いします！" onChange={event => setProfile({ ...profile, comment: event.target.value })} /><small>{Array.from(profile.comment).length} / 80</small></label>
      {choosing && <section className={styles.iconPicker} aria-label="アイコンのカードを選択"><input aria-label="アイコンのカードを検索" value={query} onChange={event => setQuery(event.target.value)} placeholder="カード名で検索" /><div>{Object.values(displayCards).filter(card => card.name.includes(query)).map(card => <button type="button" key={card.id} aria-label={`${card.name}をアイコンにする`} aria-pressed={profile.iconCardId === card.id} onClick={() => { setProfile({ ...profile, iconCardId: card.id }); setChoosing(false); }}><span className={styles.avatar}><RecordedCard id={card.id} sizes="65px" /></span><small>{card.name}</small></button>)}</div></section>}
      <button className={styles.primary} disabled={busy || !profile.displayName.trim()}>{busy ? '保存中…' : 'プロフィールを保存'}</button>
    </form>}
    <div className={styles.actions}>
      {!mine && user && <button className={styles.primary} disabled={busy || friendSent} onClick={() => void friend()}>＋ フレンド申請</button>}
      <button onClick={() => void share()}>リンクをコピー</button><Link href="/game/social/">ソーシャル ›</Link>
    </div>
    {message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
