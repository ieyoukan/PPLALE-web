import type { ReactNode } from 'react';
import { BoardSurface } from './BoardSurface';
import styles from './RoomScene.module.css';

/** The board, a solid wooden table and its floor share one perspective and one height system.
 * Seat controls stay upright outside that 3D context, so every control remains reachable. */
export function RoomScene({ seats }: { seats: [ReactNode, ReactNode] }) {
  return <div className={styles.scene} data-room-scene>
    <div className={styles.world} aria-hidden="true" inert>
      <div className={styles.floor} data-room-floor />
      <div className={styles.floorShadow} />
      {['nw', 'ne', 'sw', 'se'].map(corner => <Solid key={corner} className={styles.leg} corner={corner} />)}
      <Solid className={styles.desk} />
      <BoardSurface className={styles.surface} />
      <div className={styles.light} />
    </div>
    {seats.map((seat, side) => <div key={side} className={styles.seatSlot} data-seat={side}>{seat}</div>)}
  </div>;
}

/** All faces extend down from the top plane; table legs and tabletop use the same geometry. */
function Solid({ className, corner }: { className: string; corner?: string }) {
  return <div className={`${styles.solid} ${className}`} data-corner={corner}>
    <span className={styles.top} /><span className={styles.front} /><span className={styles.back} />
    <span className={styles.left} /><span className={styles.right} />
  </div>;
}
