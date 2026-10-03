'use client';

import { costOf } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import { gameCatalog } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { FlyingCard } from '../BoardPieces';
import { GameCard } from '../GameCard';
import { TurnAnnouncement } from '../TurnAnnouncement';
import styles from '../BoardEmulator.module.css';

/** The card under the pointer while dragging. useCardDrag moves it directly via `data-held-card`. */
export function HeldCard() {
  const { game, view, me, drag } = useBoardContext();
  const held = drag.held;
  if (!held) return null;
  return <div data-held-card className={styles.heldCard} style={{ left: held.x, top: held.y }}>
    <GameCard id={game.cards[held.uid].cardId} instance={game.cards[held.uid]} currentCost={me.hand.includes(held.uid) ? costOf(game, held.uid, gameCatalog, view) : undefined} />
  </div>;
}

/** Attack lunge, deck-to-hand flights and the turn announcement. */
export function AnimationLayer() {
  const { animations: { strike, flights, turnNotice } } = useBoardContext();
  return <>
    {turnNotice && <TurnAnnouncement key={turnNotice.id} notice={turnNotice} />}
    {strike && <div className={styles.strikeLayer}>
      <div className={styles.strikeCard} style={{ left: strike.x, top: strike.y, width: strike.width, height: strike.height, '--strike-x': `${strike.dx}px`, '--strike-y': `${strike.dy}px` } as CSSProperties}><GameCard id={strike.cardId} /></div>
      <div className={styles.impact} style={{ left: strike.x + strike.dx + strike.width / 2, top: strike.y + strike.dy + strike.height / 2 }}>✦</div>
    </div>}
    <div className={styles.flightLayer}>{flights.map(flight => <FlyingCard key={flight.uid} flight={flight} />)}</div>
  </>;
}

export function ResultBanner() {
  const { game, leave } = useBoardContext();
  if (game.winner === null) return null;
  return <div className={styles.result}>
    <strong>{game.winner === 'draw' ? '引き分け' : `${game.players[game.winner].name}の勝利`}</strong>
    <button onClick={leave}>次の対戦を準備する</button>
  </div>;
}
