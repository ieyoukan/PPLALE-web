'use client';

import { useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';

export function LogPanel() {
  const { game } = useBoardContext();
  return <>
    <h2>対戦の履歴</h2>
    {game.log.map((line, i) => <p className={styles.logLine} key={`${i}-${line}`}>{line}</p>)}
  </>;
}
