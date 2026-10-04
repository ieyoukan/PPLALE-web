'use client';

import { useBoardContext } from '../board/BoardContext';
import { outcomeOf } from './outcome';
import styles from './MatchScreens.module.css';

/** ゲームセット, then who won. Each step moves on by itself or with a tap; the result screen follows. */
export function Finale() {
  const board = useBoardContext();
  const { finale, advanceFinale } = board.animations;
  const outcome = outcomeOf(board);
  if (!outcome || finale !== 'set' && finale !== 'verdict') return null;
  return <button className={styles.finale} onClick={advanceFinale}>
    {finale === 'set'
      ? <strong key="set" className={styles.gameSet}>ゲームセット</strong>
      : <strong key="verdict" className={`${styles.verdict} ${styles[outcome.kind]}`}>{outcome.text}</strong>}
  </button>;
}
