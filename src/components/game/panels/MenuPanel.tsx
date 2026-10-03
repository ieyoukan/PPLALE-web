'use client';

import { other } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';

/** In-match actions only. Choosing the mode, levels and decks belongs to the preparation page. */
export function MenuPanel() {
  const { mode, paused, view, busy, canUndo, setPanel, setPaused, setView, undo, toggleFullscreen, leave } = useBoardContext();
  const close = (action: () => void) => () => { action(); setPanel(null); };
  return <>
    <h2>メニュー</h2>
    <div className={styles.menuList}>
      <button onClick={() => setPanel({ type: 'logs' })}>履歴</button>
      {mode !== 'hotseat' && <button onClick={close(() => setPaused(!paused))}>{paused ? 'CPU再開' : 'CPU一時停止'}</button>}
      {mode !== 'cpu' && <button onClick={close(() => setView(other(view)))}>反対側を見る</button>}
      {mode === 'hotseat' && <button disabled={!canUndo || busy} onClick={close(undo)}>一手戻す</button>}
      <button onClick={close(toggleFullscreen)}>全画面</button>
      <button className={styles.menuLeave} onClick={leave}>対戦をやめる</button>
    </div>
  </>;
}
