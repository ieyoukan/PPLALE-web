'use client';

import { canPlay, costOf, isRevealable } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/** The viewer's hand as a fan. Tap selects (or picks for an effect), drag plays. */
export function HandDock() {
  const board = useBoardContext();
  const { game, view, me, selected, drag, mulligan, remote, editing } = board;
  // The mulligan screen shows the hand itself, except while its replacements are drawn from the table.
  // (A spectator has no mulligan screen, so the hand stays on the table.)
  if (!me.hand.length && !editing || game.phase === 'mulligan' && !mulligan.remaining && !remote?.watching) return null;
  return <div className={styles.handDock}>
    <div className={styles.hand} data-hand-list>{me.hand.map((uid, index) => {
      const card = game.cards[uid], offset = index - (me.hand.length - 1) / 2;
      const classes = [
        styles.handCard, board.affordable(uid) && styles.playableHand, selected === uid && styles.selectedHand,
        board.isOption(uid) && styles.targetable, (board.flying(uid) || drag.held?.uid === uid) && styles.dealing,
      ].filter(Boolean).join(' ');
      return <button key={uid} data-hand={uid} className={classes}
        style={{ '--angle': `${Math.max(-16, Math.min(16, offset * 4))}deg`, '--lift': `${Math.min(35, Math.abs(offset) * 7)}px`, '--overlap': `${Math.min(100, Math.max(40, (me.hand.length - 4) * 13))}px`, zIndex: index } as CSSProperties}
        aria-label={`手札 ${displayCards[card.cardId].name}`} onPointerDown={event => drag.pickUp(event, uid, 'hand')}
        onClick={() => { if (!drag.clickSuppressed()) board.clickHand(uid); }}>
        <GameCard id={card.cardId} instance={card} currentCost={costOf(game, uid, gameCatalog, view)} sizes="(max-width: 900px) 130px, 160px" />
        {card.revealed && <span className={styles.revealed}>公開</span>}
      </button>;
    })}
    {editing && <button className={styles.addHand} aria-label="手札に加える" onClick={() => board.setPicking({ side: view, zone: 'hand' })}>＋</button>}
    </div>
  </div>;
}

/** Enlarged selected hand card with its actions (play / reveal). */
export function SelectedCard() {
  const board = useBoardContext();
  const { game, view, me, selected, playEnabled, drag } = board;
  // Hidden while a card is held, so it does not cover the slot being dropped on.
  if (!selected || !me.hand.includes(selected) || game.phase === 'mulligan' || drag.held) return null;
  const card = game.cards[selected], def = gameCatalog[card.cardId], cost = costOf(game, selected, gameCatalog, view);
  const unit = def.type === 'yojo';
  return <aside className={styles.cardSelection} aria-label="選んだ手札">
    <button className={styles.selectedCardImage} onPointerDown={event => drag.pickUp(event, selected, 'hand')} aria-label="選択したカードを持つ">
      <GameCard id={card.cardId} instance={card} currentCost={cost} sizes="(max-width: 700px) calc(100vw - 16px), min(calc(100vw - 184px), 67vh)" />
    </button>
    <div className={styles.cardSelectionActions}>
      <button className={styles.primaryAction} disabled={!playEnabled || cost > me.pp || unit && me.field.length >= 7 || !canPlay(game, view, selected, gameCatalog)} onClick={() => board.play(selected)}>{unit ? '場に出す' : '使う'}</button>
      {isRevealable(card.cardId) && !card.revealed && game.phase === 'playing' &&
        <button disabled={!playEnabled} onClick={() => board.act({ type: 'reveal', actor: view, uid: selected })}>公開する</button>}
      <button onClick={() => board.setSelected(null)}>閉じる</button>
    </div>
  </aside>;
}
