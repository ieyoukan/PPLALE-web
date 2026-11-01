import type { RoomView } from '@pplale/game-core/room';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomDepartureNotice.module.css';

/** The same consequences apply when going home or creating a room with chosen access. */
export function RoomDepartureNotice({ view }: { view: RoomView | null }) {
  const { t } = useI18n();
  const room = view?.plaza;
  if (!view || !room) return null;
  const seated = view.players.some(player => player?.member === room.me);
  const others = room.members.length > 1;
  return <>
    {view.status === 'playing' && view.game?.winner === null && seated && <p className={styles.warning}><GameIcon name="sword" />{t('対戦中の試合は負けになります')}</p>}
    {room.owner === room.me && others && <p className={styles.warning}><GameIcon name="crown" />{t('このルームのオーナーがいなくなります')}</p>}
    {others && <p className={styles.note}>{t('ほかの人はこのルームに残ります。')}</p>}
  </>;
}
