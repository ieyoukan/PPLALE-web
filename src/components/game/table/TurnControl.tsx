'use client';

import { availablePpMaximum, other } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import { PpPanel } from '../BoardPieces';
import styles from '../BoardEmulator.module.css';

/** Both PP gauges and the end-turn button. */
export function TurnControl() {
  const { game, view, me, playEnabled, remote, act } = useBoardContext();
  // Present from the start (disabled until the first turn), so the table never changes width.
  const mine = game.phase !== 'playing' || game.active === view;
  return <div className={styles.turnControl}>
    <PpPanel side={other(view)} current={game.players[other(view)].pp} maximum={availablePpMaximum(game, other(view))} own={false} />
    <button className={`${styles.endTurnButton} ${mine ? '' : styles.enemyTurn}`} disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>
      {remote?.watching ? <>観戦中</> : mine ? <>ターン<br />終了</> : <>相手の<br />ターン</>}
    </button>
    <PpPanel side={view} current={me.pp} maximum={availablePpMaximum(game, view)} own />
  </div>;
}
