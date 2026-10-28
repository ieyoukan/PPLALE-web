'use client';

import type { ReactNode, RefObject } from 'react';
import type { Side } from '@pplale/game-core';
import { BoardSurface } from './BoardSurface';
import { useRoomCamera } from './useRoomCamera';
import styles from './RoomScene.module.css';

/** The board, a solid wooden table and its floor share one perspective and one height system.
 * Seat controls stay upright outside that 3D context, so every control remains reachable. */
export function RoomScene({ seats, root, active, viewer, animate, ready, onReady, onSurface }: {
  seats: [ReactNode, ReactNode]; root: RefObject<HTMLDivElement | null>; active: boolean; viewer: Side;
  animate: boolean; ready: boolean; onReady: (ready: boolean) => void; onSurface: (target: HTMLDivElement | null) => void;
}) {
  const { scene, world, projection } = useRoomCamera({ root, active, viewer, animate, onReady });
  return <div ref={scene} className={styles.scene} data-room-scene data-active={active || undefined}>
    <div ref={world} className={styles.world} aria-hidden="true" inert>
      <div className={styles.floor} data-room-floor />
      <div className={styles.floorShadow} />
      {['nw', 'ne', 'sw', 'se'].map(corner => <Solid key={corner} className={styles.leg} corner={corner} />)}
      <Solid className={styles.desk} />
    </div>
    {/* Separate 3D contexts share the same camera: hardware-dependent face sorting must never
        put a wooden face over the board. Seat controls remain on the next screen layer. */}
    <div ref={projection} className={styles.boardProjection} data-room-board-projection aria-hidden={!active || undefined} inert={!active || !ready}>
      <div ref={onSurface} className={styles.surfaceMount} data-viewer={active ? viewer : undefined}>
        {!active && <BoardSurface className={styles.surface} />}
      </div>
      <div className={styles.light} aria-hidden="true" />
    </div>
    {seats.map((seat, side) => <div key={side} className={styles.seatSlot} data-seat={side} inert={active || !ready}>{seat}</div>)}
  </div>;
}

/** All faces extend down from the top plane; table legs and tabletop use the same geometry. */
function Solid({ className, corner }: { className: string; corner?: string }) {
  return <div className={`${styles.solid} ${className}`} data-corner={corner} data-room-desk={corner ? undefined : ''}>
    <span className={styles.top} /><span className={styles.front} /><span className={styles.back} />
    <span className={styles.left} /><span className={styles.right} />
  </div>;
}
