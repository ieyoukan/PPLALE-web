'use client';

import { other } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import styles from '../BoardEmulator.module.css';
import { NotificationSoundToggle } from '../notifications/GameNotifications';
import { useLaunchpad } from '@/components/game/launchpad/LaunchpadContext';
import { useI18n } from '@/i18n/LocaleProvider';

/** In-match actions only. Choosing the mode, levels and decks belongs to the preparation page. */
export function MenuPanel() {
  const { game, mode, paused, view, busy, canUndo, replaying, remote, puzzle, assessable, showAssessment, setShowAssessment, setPanel, setPaused, setView, undo, leave, stopReplay, position, editBoard, rematch } = useBoardContext();
  const local = !remote && !replaying, playing = game.phase === 'playing';
  const close = (action: () => void) => () => { action(); setPanel(null); };
  const launchpad = useLaunchpad();
  const { t, gameText } = useI18n();
  if (puzzle) return <>
    <h2>{gameText(puzzle.problem.title)}</h2>
    <div className={styles.menuList}>
      <button disabled={!canUndo || busy} onClick={close(undo)}>{t('一手戻す')}</button>
      <button disabled={busy} onClick={close(rematch)}>{t('最初からやり直す')}</button>
      <button onClick={() => setPanel({ type: 'logs' })}>{t('履歴')}</button>
      <button onClick={leave}>{t('問題一覧へ')}</button>
    </div>
  </>;
  return <>
    <h2>{t(replaying ? 'リプレイ' : 'メニュー')}</h2>
    <div className={styles.menuList}>
      {/* The game's menu: the room, friends and every other page, without leaving this match. */}
      <button onClick={close(launchpad.open)}>{t('ゲームメニュー')}</button>
      <NotificationSoundToggle />
      <button onClick={() => setPanel({ type: 'logs' })}>{t('履歴')}</button>
      {replaying
        ? <button onClick={close(() => setPaused(!paused))}>{t(paused ? '再生する' : '一時停止')}</button>
        : (mode === 'cpu' || mode === 'watch') && <button onClick={close(() => setPaused(!paused))}>{t(paused ? 'CPU再開' : 'CPU一時停止')}</button>}
      {(mode === 'hotseat' || mode === 'watch' || remote?.watching) && <button onClick={close(() => setView(other(view)))}>{t('反対側を見る')}</button>}
      {mode === 'hotseat' && !replaying && <button disabled={!canUndo || busy} onClick={close(undo)}>{t('一手戻す')}</button>}
      {/* Looking at every card is fair on a board the player made, or when playing both sides. */}
      {local && playing && game.winner === null && (mode === 'hotseat' || position) && <button onClick={() => setPanel({ type: 'analysis' })}>{t('最善手を調べる')}</button>}
      {local && playing && <button disabled={busy} onClick={editBoard}>{t('この盤面を編集する')}</button>}
      {local && position && <button disabled={busy} onClick={close(rematch)}>{t('最初の盤面に戻す')}</button>}
      {assessable && <button onClick={close(() => setShowAssessment(!showAssessment))}>{t(showAssessment ? '形勢を隠す' : '形勢を表示する')}</button>}
      {replaying
        ? <button className={styles.menuLeave} onClick={stopReplay}>{t('リプレイをやめる')}</button>
        : remote && !remote.watching && game.winner === null
          ? <button className={styles.menuLeave} onClick={() => setPanel({ type: 'endMatch' })}>{t(remote.abort ? '対戦を中断する' : '投降する')}</button>
          : remote?.plaza ? <button className={styles.menuLeave} onClick={close(remote.plaza.menu)}>{t('ルームのメニュー')}</button>
            : local && mode === 'cpu' && game.winner === null ? <button className={styles.menuLeave} onClick={() => setPanel({ type: 'endMatch' })}>{t('対戦を中断する')}</button>
              : <button className={styles.menuLeave} onClick={leave}>{t(remote?.recorded ? '対戦履歴へ戻る' : remote?.watching ? '観戦をやめる' : remote ? 'ルームを出る' : '対戦をやめる')}</button>}
    </div>
  </>;
}
