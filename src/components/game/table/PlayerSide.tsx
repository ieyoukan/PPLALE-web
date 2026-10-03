'use client';

import { maxPp } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import type { DeckKind, Side } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { Counter, DeckStack } from '../BoardPieces';
import type { ZoneKind } from '../BoardPieces';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const FIELD_SLOTS = 7;

/** One player's half of the table: decks, piles, playable, counters, field and (far side) hand backs. */
export function PlayerSide({ side }: { side: Side }) {
  const board = useBoardContext();
  const { game, view, mode, busy, attacker, attackLeader } = board;
  const player = game.players[side], near = side === view;
  const sandbox = mode === 'hotseat' && game.phase === 'playing' && !game.pending && !busy;
  const leaderTarget = !!attacker && side !== view && board.canStrike(attacker, 'leader');
  return <section className={`${styles.playerSide} ${near ? styles.near : styles.far}`} aria-label={side === 0 ? 'あなたの盤面' : '相手の盤面'}>
    <Zone side={side} kind="yojo" className={styles.deckYojo} />
    <Zone side={side} kind="sweet" className={styles.deckSweet} />
    <Zone side={side} kind="nap" className={styles.napZone} />
    <Zone side={side} kind="exile" className={styles.exileZone} />
    <button className={styles.playableZone} onClick={() => board.setPanel({ type: 'skills', side })} aria-label={`${side === 0 ? 'あなた' : '相手'}のスキル`}>
      <span className={styles.playableCard}><GameCard id={player.playable} /></span>
    </button>
    <div className={styles.turnCounter}>
      <Counter label="ターン数(+pp)" value={player.turns} bonus={player.ppBonus} pp={`${player.pp} / ${maxPp(game, side)}`} test={sandbox}
        onAdjust={delta => board.adjust(side, 'ppBonus', delta)} onReset={() => board.adjust(side, 'ppBonus', -player.ppBonus)} />
    </div>
    <div className={styles.pointsCounter} data-leader={side}>
      <Counter label="お菓子ポイント" value={player.points} points target={leaderTarget} test={sandbox} onClick={attackLeader}
        onAdjust={delta => board.adjust(side, 'points', delta)} onReset={() => board.adjust(side, 'points', player.maxPoints - player.points)} />
      {player.shield && <span className={styles.shieldIndicator}>パンケーキ保護</span>}
    </div>
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Field</span>
      {Array.from({ length: FIELD_SLOTS }, (_, slot) => <FieldSlot key={slot} side={side} slot={slot} />)}
    </div>
    {!near && <div className={styles.opponentHand} aria-label={`相手の手札 ${player.hand.length}枚`}>
      {player.hand.map((uid, i) => <span key={uid} data-hand={uid} className={`${styles.hiddenCard} ${board.flying(uid) ? styles.dealing : ''}`}
        style={{ '--hand-index': i - (player.hand.length - 1) / 2, '--fan-step': `${Math.min(56, 360 / Math.max(1, player.hand.length))}px` } as CSSProperties}>
        {game.cards[uid].revealed && <GameCard id={game.cards[uid].cardId} />}
      </span>)}
    </div>}
  </section>;
}

/** Deck stacks draw when a draw is pending; nap / exile open their list. */
function Zone({ side, kind, className }: { side: Side; kind: ZoneKind; className: string }) {
  const board = useBoardContext();
  const player = board.game.players[side];
  const deck = kind === 'yojo' || kind === 'sweet';
  const drawing = deck && board.deckReady(side, kind as DeckKind);
  return <div className={className}>
    <DeckStack side={side} kind={kind} ids={player[kind]} thresholds={player.milestones} enabled={deck ? drawing : true} drawing={drawing}
      onClick={() => deck ? board.clickDeck(side, kind as DeckKind) : board.setPanel({ type: 'zone', side, kind: kind as 'nap' | 'exile' })} />
  </div>;
}

function FieldSlot({ side, slot }: { side: Side; slot: number }) {
  const board = useBoardContext();
  const { game, view, attacker, selected, playEnabled, drag, animations } = board;
  const near = side === view;
  const uid = game.players[side].field.find(id => game.cards[id].slot === slot), card = uid ? game.cards[uid] : null;
  const targeting = !!uid && (board.isOption(uid) || !!attacker && side !== view && board.canStrike(attacker, uid));
  const placing = !!selected && near && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo';
  const classes = [
    styles.fieldSlot, card && styles.occupied, (targeting || placing) && styles.targetable, uid === attacker && styles.attacking,
    card?.exhausted && styles.exhausted, uid && (drag.held?.uid === uid || animations.strike?.uid === uid) && styles.dealing,
    card?.keywords.includes('taunt') && styles.tauntCard,
  ].filter(Boolean).join(' ');
  return <button data-slot={slot} data-side={side} data-unit={uid} disabled={!!attacker && side !== view && !targeting} className={classes}
    aria-label={`${side === 0 ? 'あなた' : '相手'}の場 ${slot + 1} ${card ? displayCards[card.cardId].name : '空き'}`}
    onClick={() => { if (!drag.clickSuppressed()) board.clickSlot(side, uid, slot); }}
    onPointerDown={event => { if (uid && near) drag.pickUp(event, uid, 'field'); }}
    onContextMenu={event => { event.preventDefault(); if (uid) board.setPanel({ type: 'inspect', uid }); }}>
    {card && <>
      <GameCard id={card.cardId} instance={card} abilities />
      {!card.exhausted && board.canAttackNow(uid!) && <span className={styles.readyGem} />}
    </>}
  </button>;
}
