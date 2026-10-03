'use client';

import type { Side } from '@pplale/game-core';
import { sideName, useBoardContext } from '../board/BoardContext';
import { OpeningDie } from '../OpeningDie';
import styles from '../BoardEmulator.module.css';

/** Dice for the first player, then the winner's first / second choice. */
export function DiceStage() {
  const board = useBoardContext();
  const { game, setup, dice, busy } = board;
  if (setup || !(game.phase === 'dice' || game.phase === 'initiative' || dice.reveal)) return null;
  const visible: Side = dice.busy ? dice.rollingSide : game.phase === 'opening' ? 1 : dice.nextDie;
  const value = dice.rolling ? dice.outcome : dice.complete && game.phase === 'dice' && !dice.reveal ? null : game.dice?.rolls[visible] ?? null;
  const interactive = game.phase === 'dice' && !busy && board.canControl(visible) && visible === dice.nextDie;
  const chooser = <strong className={styles.diceResult}>{sideName(board, game.active)}が選べる！</strong>;
  return <div className={styles.diceFocus} role="group" aria-label="先攻・後攻のダイス">
    <div className={styles.diceStage}>
      {game.phase === 'initiative' && !busy ? <>
        {chooser}
        <div className={styles.initiativeChoices}>{(['first', 'second'] as const).map(order =>
          <button key={order} disabled={!board.canControl(game.active)} onClick={() => board.act({ type: 'initiative', actor: game.active, order })}>{order === 'first' ? '先攻' : '後攻'}</button>)}
        </div>
      </> : <>
        <div className={styles.focusDie}>
          <span>{sideName(board, visible)}</span>
          <OpeningDie value={value} rolling={dice.rolling} interactive={interactive} label={sideName(board, visible)} onRoll={dice.roll} />
        </div>
        {game.phase === 'initiative' && chooser}
      </>}
      {game.phase === 'dice' && dice.complete && !dice.rolling && <strong className={styles.diceTie}>引き分け！</strong>}
    </div>
  </div>;
}
