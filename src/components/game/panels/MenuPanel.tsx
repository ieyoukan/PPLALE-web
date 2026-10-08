'use client';

import { useState } from 'react';
import { other } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';

/** In-match actions only. Choosing the mode, levels and decks belongs to the preparation page. */
export function MenuPanel() {
  const { game, mode, paused, view, busy, canUndo, replaying, remote, assessable, showAssessment, setShowAssessment, setPanel, setPaused, setView, undo, toggleFullscreen, leave, stopReplay, position, editBoard, rematch } = useBoardContext();
  const local = !remote && !replaying, playing = game.phase === 'playing';
  // Giving up ends the match for both players, so it is asked twice.
  const [resigning, setResigning] = useState(false);
  const close = (action: () => void) => () => { action(); setPanel(null); };
  return <>
    <h2>{replaying ? 'リプレイ' : 'メニュー'}</h2>
    <div className={styles.menuList}>
      <button onClick={() => setPanel({ type: 'logs' })}>履歴</button>
      {replaying
        ? <button onClick={close(() => setPaused(!paused))}>{paused ? '再生する' : '一時停止'}</button>
        : (mode === 'cpu' || mode === 'watch') && <button onClick={close(() => setPaused(!paused))}>{paused ? 'CPU再開' : 'CPU一時停止'}</button>}
      {(mode === 'hotseat' || mode === 'watch' || remote?.watching) && <button onClick={close(() => setView(other(view)))}>反対側を見る</button>}
      {mode === 'hotseat' && !replaying && <button disabled={!canUndo || busy} onClick={close(undo)}>一手戻す</button>}
      {/* Looking at every card is fair on a board the player made, or when playing both sides. */}
      {local && playing && game.winner === null && (mode === 'hotseat' || position) && <button onClick={() => setPanel({ type: 'analysis' })}>最善手を調べる</button>}
      {local && playing && <button onClick={editBoard}>この盤面を編集</button>}
      {local && position && <button disabled={busy} onClick={close(rematch)}>最初の盤面に戻す</button>}
      {assessable && <button onClick={close(() => setShowAssessment(!showAssessment))}>{showAssessment ? '形勢を隠す' : '形勢を表示する'}</button>}
      <button onClick={close(toggleFullscreen)}>全画面</button>
      {replaying
        ? <button className={styles.menuLeave} onClick={stopReplay}>リプレイをやめる</button>
        : remote && !remote.watching && game.winner === null
          ? resigning
            ? <>
              <button className={styles.menuLeave} onClick={close(remote.resign)}>投了する（負けになります）</button>
              <button onClick={() => setResigning(false)}>対戦を続ける</button>
            </>
            : <button className={styles.menuLeave} onClick={() => setResigning(true)}>投了する</button>
          : <button className={styles.menuLeave} onClick={leave}>{remote?.watching ? '観戦をやめる' : remote ? 'ルームを出る' : '対戦をやめる'}</button>}
    </div>
  </>;
}
