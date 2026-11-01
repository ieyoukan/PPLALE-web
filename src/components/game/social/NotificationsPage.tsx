'use client';

import { useAuth } from '@/lib/auth';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { FriendTile } from './FriendTile';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import { UserSearch } from './UserSearch';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

export { NOTIFICATIONS_PATH } from '@/lib/game/sessionStore';

export function NotificationsPage() {
  const { user, loading, signInWithGoogle } = useAuth(), { t } = useI18n();
  if (loading) return <p role="status">{t('読み込み中…')}</p>;
  if (!user) return <section className={`${styles.panel} ${styles.signIn}`}><GameIcon name="bell" className={styles.signInIcon} /><p>{t('ログインすると、フレンド申請が届きます。')}</p><OrnateFrame as="button" size="sm" className={styles.cardButton} onClick={() => void signInWithGoogle()}><GameIcon name="heart" /><span data-ui-title>{t('ログイン')}</span></OrnateFrame></section>;
  return <Notifications key={user.uid} uid={user.uid} />;
}
/** Friend requests: the ones received to answer, the ones sent to take back, and finding someone by name or profile link. */
function Notifications({ uid }: { uid: string }) {
  const { received, sent, error, loading, busy, respond } = useSocial(uid), { t } = useI18n();
  return <section className={styles.panel} aria-label={t('通知')}>
    {received.length > 0 && <header className={styles.socialHeading}><span className={styles.badge} role="status" aria-label={t('届いた申請 {count}件', { count: received.length })}>{received.length}</span></header>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <UserSearch />
    {!received.length && !sent.length && <div className={styles.empty} role="status"><GameIcon name="letter" /><p>{loading ? t('読み込み中…') : t('通知はありません')}</p></div>}
    {received.length > 0 && <details className={styles.group} data-place="pending" open>
      <summary><span className={styles.chevron} aria-hidden="true" /><GameIcon name="letter" />{t('届いた申請')}<em className={styles.badge}>{received.length}</em></summary>
      <div className={styles.tiles}>{received.map(({ profile, friendship }) => <FriendTile key={friendship.id} profile={profile} place="pending" status={t('申請')}>
        <span className={styles.answer}>
          <button className={styles.accept} aria-label={t('承認')} disabled={!!busy} onClick={() => void respond(friendship, true)}><GameIcon name="check" /></button>
          <button className={styles.decline} aria-label={t('見送る')} disabled={!!busy} onClick={() => void respond(friendship, false)}><GameIcon name="close" /></button>
        </span>
      </FriendTile>)}</div>
    </details>}
    {sent.length > 0 && <details className={styles.group} data-place="sent" open>
      <summary><span className={styles.chevron} aria-hidden="true" /><GameIcon name="send" />{t('送った申請')}<em className={styles.badge}>{sent.length}</em></summary>
      <div className={styles.tiles}>{sent.map(({ profile, friendship }) => <FriendTile key={friendship.id} profile={profile} place="sent" status={t('返事待ち')}>
        <span className={styles.answer}><button className={styles.decline} aria-label={t('取り消す')} disabled={!!busy} onClick={() => void respond(friendship, false)}><GameIcon name="close" /></button></span>
      </FriendTile>)}</div>
    </details>}
  </section>;
}
