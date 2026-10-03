'use client';

import Link from 'next/link';
import { other } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';

export function MenuPanel() {
  const { mode, paused, view, busy, canUndo, setPanel, setMode, setPaused, setView, undo, toggleFullscreen } = useBoardContext();
  const close = (action: () => void) => () => { action(); setPanel(null); };
  return <>
    <h2>メニュー</h2>
    <div className={styles.menuList}>
      <button onClick={() => setPanel({ type: 'setup' })}>対戦の準備</button>
      {/* The match continues in the other mode: take over a side, hand it to the CPU, or just watch. */}
      {mode !== 'cpu' && <button onClick={close(() => { setMode('cpu'); setView(0); })}>{mode === 'watch' ? '下側を自分で操作' : 'CPUに任せる'}</button>}
      {mode !== 'hotseat' && <button onClick={close(() => setMode('hotseat'))}>両側を操作</button>}
      {mode !== 'watch' && <button onClick={close(() => setMode('watch'))}>CPU同士を観戦</button>}
      {mode !== 'hotseat' && <button onClick={close(() => setPaused(!paused))}>{paused ? 'CPU再開' : 'CPU一時停止'}</button>}
      {mode !== 'cpu' && <button onClick={close(() => setView(other(view)))}>反対側を見る</button>}
      {mode === 'hotseat' && <button disabled={!canUndo || busy} onClick={close(undo)}>一手戻す</button>}
      <button onClick={() => setPanel({ type: 'logs' })}>履歴</button>
      <button onClick={close(toggleFullscreen)}>全画面</button>
      <Link href="/">ホームへ</Link>
    </div>
  </>;
}
