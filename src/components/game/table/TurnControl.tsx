'use client';

import { maxPp, other } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import { PpPanel } from '../BoardPieces';
import styles from '../BoardEmulator.module.css';

/** Both PP gauges and the end-turn button. */
export function TurnControl() {
  const { game, view, me, playEnabled, act } = useBoardContext();
  if (game.phase !== 'playing') return null;
  const mine = game.active === view;
  return <div className={styles.turnControl}>
    <PpPanel current={game.players[other(view)].pp} maximum={maxPp(game, other(view))} own={false} />
    <button className={`${styles.endTurnButton} ${mine ? '' : styles.enemyTurn}`} disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>
      {mine ? <>ターン<br />終了</> : <>相手の<br />ターン</>}
    </button>
    <PpPanel current={me.pp} maximum={maxPp(game, view)} own />
  </div>;
}
