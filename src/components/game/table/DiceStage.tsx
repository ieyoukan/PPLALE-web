'use client';

import { useState } from 'react';
import type { Side } from '@pplale/game-core';
import { sideName, useBoardContext } from '../board/BoardContext';
import { OpeningDie } from '../OpeningDie';
import styles from '../BoardEmulator.module.css';
import screens from './MatchScreens.module.css';

type Order = 'first' | 'second';
const orders: [Order, string][] = [['first', '先攻'], ['second', '後攻']];

/** Dice for the first player, then the winner's first / second choice. */
export function DiceStage() {
  const board = useBoardContext();
  const { game, dice, busy } = board;
  if (!(game.phase === 'dice' || game.phase === 'initiative' || dice.reveal)) return null;
  const choosing = game.phase === 'initiative' && !busy;
  // A CPU decides by itself; its choice is shown by the versus screen that follows.
  if (choosing && !board.canControl(game.active)) return null;
  const visible: Side = dice.busy ? dice.rollingSide : game.phase === 'opening' ? 1 : dice.nextDie;
  const value = dice.rolling ? dice.outcome : dice.complete && game.phase === 'dice' && !dice.reveal ? null : game.dice?.rolls[visible] ?? null;
  const interactive = game.phase === 'dice' && !busy && board.canControl(visible) && visible === dice.nextDie;
  return <div className={styles.diceFocus} role="group" aria-label="先攻・後攻のダイス">
    <div className={styles.diceStage}>
      {choosing ? <OrderChoice onDecide={order => board.act({ type: 'initiative', actor: game.active, order })} /> : <>
        <div className={styles.focusDie}>
          <span>{sideName(board, visible)}</span>
          <OpeningDie value={value} rolling={dice.rolling} interactive={interactive} label={sideName(board, visible)} onRoll={dice.roll} />
        </div>
      </>}
      {game.phase === 'dice' && dice.complete && !dice.rolling && <strong className={styles.diceTie}>引き分け！</strong>}
    </div>
  </div>;
}

/** The dice winner picks one of two plates, then confirms. */
function OrderChoice({ onDecide }: { onDecide: (order: Order) => void }) {
  const [picked, setPicked] = useState<Order | null>(null);
  return <div className={screens.orderChoice}>
    <h2>先攻 / 後攻を選択</h2>
    <div className={screens.orderOptions} role="radiogroup" aria-label="先攻 / 後攻">{orders.map(([order, word]) =>
      <button key={order} role="radio" aria-checked={picked === order} aria-label={word}
        className={`${screens.orderPlate} ${screens.orderOption} ${order === 'first' ? screens.plateFirst : screens.plateSecond} ${picked === order ? screens.orderPicked : ''}`}
        onClick={() => setPicked(order)}>
        <strong><span aria-hidden="true">{word[0]}</span><span aria-hidden="true">{word[1]}</span></strong>
      </button>)}
    </div>
    <button className={screens.orderDecide} disabled={!picked} onClick={() => picked && onDecide(picked)}>決定</button>
  </div>;
}
