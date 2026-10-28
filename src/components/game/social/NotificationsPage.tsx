'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { FriendTile } from './FriendTile';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

export { NOTIFICATIONS_PATH } from '@/lib/game/sessionStore';

export function NotificationsPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  if (loading) return <p role="status">読み込み中…</p>;
  if (!user) return <section className={`${styles.panel} ${styles.signIn}`}><GameIcon name="bell" className={styles.signInIcon} /><p>ログインすると、フレンド申請が届きます。</p><OrnateFrame as="button" size="sm" className={styles.cardButton} onClick={() => void signInWithGoogle()}><GameIcon name="heart" /><span data-ui-title>ログイン</span></OrnateFrame></section>;
  return <Notifications key={user.uid} uid={user.uid} />;
}
/** Friend requests: the ones received to answer, the ones sent to take back, and adding a friend from a profile link. */
function Notifications({ uid }: { uid: string }) {
  const { received, sent, error, loading, busy, respond } = useSocial(uid);
  const [profileLink, setProfileLink] = useState('');
  let target = '';
  try { target = new URL(profileLink).searchParams.get('id') ?? ''; } catch { if (/^[\w-]{1,128}$/.test(profileLink)) target = profileLink; }
  return <section className={styles.panel} aria-label="通知">
    {received.length > 0 && <header className={styles.socialHeading}><span className={styles.badge} role="status" aria-label={`届いた申請 ${received.length}件`}>{received.length}</span></header>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.addFriend}><label><GameIcon name="add" /><input value={profileLink} onChange={event => setProfileLink(event.target.value)} placeholder="受け取ったプロフィールのリンク" aria-label="プロフィールのリンク" /></label>{target && <Link className={styles.primary} href={`/game/profile/?id=${encodeURIComponent(target)}`}>プロフィールを見る ›</Link>}</div>
    {!received.length && !sent.length && <div className={styles.empty} role="status"><GameIcon name="letter" /><p>{loading ? '読み込み中…' : '通知はありません'}</p></div>}
    {received.length > 0 && <details className={styles.group} data-place="pending" open>
      <summary><span className={styles.chevron} aria-hidden="true" /><GameIcon name="letter" />届いた申請<em className={styles.badge}>{received.length}</em></summary>
      <div className={styles.tiles}>{received.map(({ profile, friendship }) => <FriendTile key={friendship.id} profile={profile} place="pending" status="申請">
        <span className={styles.answer}>
          <button className={styles.accept} aria-label="承認" disabled={!!busy} onClick={() => void respond(friendship, true)}><GameIcon name="check" /></button>
          <button className={styles.decline} aria-label="見送る" disabled={!!busy} onClick={() => void respond(friendship, false)}><GameIcon name="close" /></button>
        </span>
      </FriendTile>)}</div>
    </details>}
    {sent.length > 0 && <details className={styles.group} data-place="sent" open>
      <summary><span className={styles.chevron} aria-hidden="true" /><GameIcon name="send" />送った申請<em className={styles.badge}>{sent.length}</em></summary>
      <div className={styles.tiles}>{sent.map(({ profile, friendship }) => <FriendTile key={friendship.id} profile={profile} place="sent" status="返事待ち">
        <span className={styles.answer}><button className={styles.decline} aria-label="取り消す" disabled={!!busy} onClick={() => void respond(friendship, false)}><GameIcon name="close" /></button></span>
      </FriendTile>)}</div>
    </details>}
  </section>;
}
