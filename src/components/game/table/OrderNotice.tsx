'use client';

import { other } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { sideName, useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';

/** After a CPU chose: the viewer's side on the left, the other on the right, each with its order. */
export function OrderNotice() {
  const board = useBoardContext();
  const { view, animations: { order } } = board;
  if (!order) return null;
  const panel = (side: Side) => {
    const first = side === order.first;
    return <div className={`${styles.orderSide} ${first ? styles.orderFirst : styles.orderSecond}`}>
      <span>{sideName(board, side)}</span>
      <strong>{first ? '先攻' : '後攻'}</strong>
    </div>;
  };
  return <div className={styles.orderNotice} role="status" aria-live="polite">
    <p>{sideName(board, order.chooser)}が{order.chooser === order.first ? '先攻' : '後攻'}をえらびました</p>
    <div className={styles.orderSides}>{panel(view)}<i aria-hidden="true">✿</i>{panel(other(view))}</div>
  </div>;
}
