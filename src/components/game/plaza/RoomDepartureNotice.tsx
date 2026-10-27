import type { RoomView } from '@pplale/game-core/room';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './RoomDepartureNotice.module.css';

/** The same consequences apply when going home or creating a room with chosen access. */
export function RoomDepartureNotice({ view }: { view: RoomView | null }) {
  const room = view?.plaza;
  if (!view || !room) return null;
  const seated = view.players.some(player => player?.member === room.me);
  const others = room.members.length > 1;
  return <>
    {view.status === 'playing' && view.game?.winner === null && seated && <p className={styles.warning}><GameIcon name="sword" />対戦中の試合は負けになります</p>}
    {room.owner === room.me && others && <p className={styles.warning}><GameIcon name="crown" />このルームのオーナーがいなくなります</p>}
    {others && <p className={styles.note}>ほかの人はこのルームに残ります。</p>}
  </>;
}
