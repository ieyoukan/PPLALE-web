'use client';

import { availablePpMaximum, other } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import { PpPanel } from '../BoardPieces';
import { RoundActionButton } from '@/components/shared/ui/ornament/RoundActionButton';
import actionStyles from './TurnControl.module.css';
import { TurnClock } from './TurnClock';
import styles from '../BoardEmulator.module.css';

/** Both PP gauges and the end-turn button. */
export function TurnControl() {
  const { game, view, me, names, portraits, playEnabled, remote, act, editing, setPanel } = useBoardContext();
  // Present from the start (disabled until the first turn), so the table never changes width.
  const mine = game.phase !== 'playing' || game.active === view;
  const orderFor = (side: Side) => game.phase === 'dice' || game.phase === 'initiative'
    ? undefined : side === game.rules.firstPlayer ? 'first' as const : 'second' as const;
  return <div className={styles.turnControl}>
    <PpPanel side={other(view)} name={names[other(view)]} portrait={portraits[other(view)]} order={orderFor(other(view))} current={game.players[other(view)].pp} maximum={availablePpMaximum(game, other(view))} own={false} />
    {editing
      ? <RoundActionButton tone="sage" className={`${actionStyles.action} ${actionStyles.play}`} onClick={() => setPanel({ type: 'play' })}>この盤面で<br />遊ぶ</RoundActionButton>
      : <RoundActionButton tone={mine ? 'pink' : 'muted'} className={actionStyles.action} disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>
        {remote?.watching && !remote.recorded ? <>観戦中</> : mine ? <>ターン<br />終了</> : <>相手の<br />ターン</>}
      </RoundActionButton>}
    {remote?.turnClock && remote.turnClock.turn === game.turn && game.winner === null && <TurnClock clock={remote.turnClock} />}
    <PpPanel side={view} name={names[view]} portrait={portraits[view]} order={orderFor(view)} current={me.pp} maximum={availablePpMaximum(game, view)} own />
  </div>;
}
