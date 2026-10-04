import Link from 'next/link';
import { HOME_PATH } from '@/lib/game/sessionStore';
import styles from './CardsMenu.module.css';

/** The バトル tab until matches between players exist: room matches will start from here. */
export function BattleSoon() {
  return <div className={styles.tiles}>
    <div className={`${styles.tile} ${styles.soon}`} aria-disabled="true">
      <b>ルームマッチ</b>
      <span>準備中です。ルームを作って、ほかのプレイヤーと対戦できるようにする予定です。</span>
    </div>
    <Link href={HOME_PATH} className={styles.tile}><b>CPU対決</b><span>いまはCPUと対戦できます</span></Link>
  </div>;
}
