'use client';

// 名前で招待されたルームを表示する。取得はゲーム全体で1か所（NoticeToasts）にまとめ、招待がなければ表示しない。
import { useNotices } from '../notifications/NoticeToasts';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import { usePlaza } from '../plaza/PlazaProvider';
import { RoomCard } from './RoomCard';
import styles from './Social.module.css';
import own from './RoomCard.module.css';

/** The invitations the game already looks at (NoticeToasts), without asking again here. */
export function Invitations() {
  const { id: here } = usePlaza(), { t } = useI18n();
  const { invitations } = useNotices();
  const shown = invitations.filter(room => room.id !== here);
  if (!shown.length) return null;
  return <section className={own.invited} aria-label={t('招待が届いています')}>
    <h3><GameIcon name="letter" />{t('招待が届いています')}</h3>
    <div className={styles.tiles}>{shown.map(room => <RoomCard key={room.id} room={room} />)}</div>
  </section>;
}
