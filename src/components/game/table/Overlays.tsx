'use client';

import { costOf } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import { gameCatalog } from '@/lib/game/catalog';
import { sideName, useBoardContext } from '../board/BoardContext';
import { FlyingCard } from '../BoardPieces';
import { GameCard } from '../GameCard';
import { TurnAnnouncement } from '../TurnAnnouncement';
import styles from '../BoardEmulator.module.css';

// A spiky but soft cloud, like a cartoon scuffle: an uneven star whose tips are rounded by its stroke.
const SCUFFLE = '50.0,7.2 57.2,20.9 72.9,6.4 69.2,28.3 89.2,23.0 76.2,40.1 95.7,44.5 81.8,53.9 91.5,65.7 75.5,67.6 78.4,82.0 63.9,76.6 61.8,97.8 50.0,79.0 38.6,96.2 37.0,74.8 19.5,84.4 23.7,68.2 8.5,65.7 19.2,53.7 7.5,44.8 21.9,39.4 9.5,22.1 30.8,28.3 27.9,7.9 43.3,22.8';

/** The card under the pointer while dragging. useCardDrag moves it directly via `data-held-card`. */
export function HeldCard() {
  const { game, view, me, drag } = useBoardContext();
  const held = drag.held;
  if (!held) return null;
  return <div data-held-card className={styles.heldCard} style={{ left: held.x, top: held.y }}>
    <GameCard id={game.cards[held.uid].cardId} instance={game.cards[held.uid]} currentCost={me.hand.includes(held.uid) ? costOf(game, held.uid, gameCatalog, view) : undefined} />
  </div>;
}

/** Attack lunge, damage numbers, the opponent's non-card choices, deck-to-hand flights and the turn announcement. */
export function AnimationLayer() {
  const board = useBoardContext();
  const { strike, flights, turnNotice, hits, choiceNote } = board.animations;
  return <>
    {turnNotice && <TurnAnnouncement key={turnNotice.id} notice={turnNotice} />}
    {strike && <div className={styles.strikeLayer}>
      <div className={styles.strikeCard} style={{ left: strike.x, top: strike.y, width: strike.width, height: strike.height, '--strike-x': `${strike.dx}px`, '--strike-y': `${strike.dy}px` } as CSSProperties}><GameCard id={strike.cardId} /></div>
      <div className={styles.impact} style={{ left: strike.x + strike.dx + strike.width / 2, top: strike.y + strike.dy + strike.height / 2 }}>✦</div>
    </div>}
    {hits.map(hit => <strong key={hit.id} className={`${styles.hitNumber} ${hit.kind === 'attack' ? styles.hitAttack : ''}`} style={{ left: hit.x, top: hit.y }} role="status" aria-label={`${hit.amount}ダメージ`}>
      {hit.kind === 'attack' && <svg className={styles.hitBurst} viewBox="0 0 100 100" aria-hidden="true"><polygon points={SCUFFLE} /></svg>}
      {hit.amount}
    </strong>)}
    {choiceNote && <div key={choiceNote.id} className={styles.choiceNote} role="status">{sideName(board, choiceNote.side)}：{choiceNote.label}</div>}
    <div className={styles.flightLayer}>{flights.map(flight => <FlyingCard key={flight.uid} flight={flight} />)}</div>
  </>;
}
