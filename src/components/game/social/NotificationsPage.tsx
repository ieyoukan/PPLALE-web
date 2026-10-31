'use client';

import { useAuth } from '@/lib/auth';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { FriendTile } from './FriendTile';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { UserSearch } from './UserSearch';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

export { NOTIFICATIONS_PATH } from '@/lib/game/sessionStore';

export function NotificationsPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  if (loading) return <p role="status">読み込み中…</p>;
  if (!user) return <section className={`${styles.panel} ${styles.signIn}`}><GameIcon name="bell" className={styles.signInIcon} /><p>ログインすると、フレンド申請が届きます。</p><OrnateFrame as="button" size="sm" className={styles.cardButton} onClick={() => void signInWithGoogle()}><GameIcon name="heart" /><span data-ui-title>ログイン</span></OrnateFrame></section>;
  return <Notifications key={user.uid} uid={user.uid} />;
}
/** Friend requests: the ones received to answer, the ones sent to take back, and finding someone by name or profile link. */
function Notifications({ uid }: { uid: string }) {
  const { received, sent, error, loading, busy, respond } = useSocial(uid);
  return <section className={styles.panel} aria-label="通知">
    {received.length > 0 && <header className={styles.socialHeading}><span className={styles.badge} role="status" aria-label={`届いた申請 ${received.length}件`}>{received.length}</span></header>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <UserSearch />
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
