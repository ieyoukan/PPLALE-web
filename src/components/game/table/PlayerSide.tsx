'use client';

import { availablePpMaximum, playableMp } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import type { DeckKind, Side } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { cardCounts } from '../board/matchInfo';
import { useLongPress } from '../board/useLongPress';
import { Counter, DeckStack } from '../BoardPieces';
import type { ZoneKind } from '../BoardPieces';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const FIELD_SLOTS = 7;

/** One player's half of the table: decks, piles, playable, counters, field and (far side) hand backs. */
export function PlayerSide({ side }: { side: Side }) {
  const board = useBoardContext();
  const { game, view, mode, busy, attacker, attackLeader, remote, editing, setup } = board;
  const player = game.players[side], near = side === view;
  // In a room either seat may be this screen's; elsewhere side 0 is the player.
  const who = (mode === 'room' ? near : side === 0) ? 'あなた' : '相手';
  const sandbox = editing || mode === 'hotseat' && game.phase === 'playing' && !game.pending && !busy;
  // Face-up layouts still respect redaction; only identities supplied by the server are visible.
  const open = mode === 'watch' || mode === 'puzzle' || !!remote?.watching || editing;
  const leaderTarget = !!attacker && side !== view && board.canStrike(attacker, 'leader');
  const concealed = player.hand.filter(uid => !game.cards[uid].revealed);
  const revealed = player.hand.filter(uid => game.cards[uid].revealed);
  const mixed = concealed.length > 0 && revealed.length > 0;
  const mp = playableMp[player.playable];
  const counts = cardCounts(player, gameCatalog);
  const fruits = (remote?.matchRules ?? setup?.matchRules)?.fruits;
  const showMochida = !fruits || fruits.includes('melon') || counts.mochida > 0;
  return <section className={`${styles.playerSide} ${near ? styles.near : styles.far}`} aria-label={`${who}の盤面`}>
    <Zone side={side} kind="yojo" className={styles.deckYojo} />
    <Zone side={side} kind="sweet" className={styles.deckSweet} />
    <Zone side={side} kind="nap" className={styles.napZone} />
    <Zone side={side} kind="exile" className={styles.exileZone} />
    <button className={styles.playableZone} onClick={() => board.setPanel(editing ? { type: 'editPlayer', side } : { type: 'skills', side })} aria-label={editing ? `${who}の設定` : `${who}のスキル`}>
      <span className={styles.playableCard}><GameCard id={player.playable} sizes="90px" /></span>
      {/* MP is public, like PP: shown on the playable that has it (しゅれい). */}
      {mp && <span className={styles.mpBadge} role="img" aria-label={`MP ${player.mp ?? 0} / ${mp.max}`}>MP {player.mp ?? 0}/{mp.max}</span>}
    </button>
    <div className={styles.turnCounter}>
      {/* Edit mode: the number shown (the turn count) is what the buttons change, and the PP is filled to the
          new maximum as at the start of a turn; the rest of the player is behind the label. */}
      {editing
        ? <Counter label="ターン数(+pp)" value={player.turns} bonus={player.ppBonus} pp={`${player.pp} / ${availablePpMaximum(game, side)}`} test adjusts="ターン数"
          onClick={() => board.setPanel({ type: 'editPlayer', side })}
          onAdjust={delta => board.edit({ type: 'player', side, turns: player.turns + delta, pp: player.turns + delta + player.ppBonus })} onReset={() => board.edit({ type: 'player', side, turns: 1, ppBonus: 0, pp: 1 })} />
        : <Counter label="ターン数(+pp)" value={player.turns} bonus={player.ppBonus} temporaryBonus={player.turnPpBonus} pp={`${player.pp} / ${availablePpMaximum(game, side)}`} test={sandbox}
          onAdjust={delta => board.adjust(side, 'ppBonus', delta)} onReset={() => board.adjust(side, 'ppBonus', -player.ppBonus)} />}
    </div>
    <div className={styles.pointsCounter} data-leader={side}>
      <Counter label="お菓子ポイント" value={player.points} points target={leaderTarget} test={sandbox} onClick={editing ? () => board.setPanel({ type: 'editPlayer', side }) : attackLeader}
        onAdjust={delta => board.adjust(side, 'points', delta)} onReset={() => board.adjust(side, 'points', player.maxPoints - player.points)} />
      {player.shield && <span className={styles.shieldIndicator}>パンケーキ保護</span>}
    </div>
    <div className={styles.field}>
      <button className={styles.fieldCounts} onClick={() => board.setPanel({ type: 'counts' })} aria-label={`${who}のカウント：うゆち ${counts.uyuchi}、お菓子 ${counts.sweets}、場を離れたもちだ ${counts.mochida}`}>
        <span>うゆち <b>{counts.uyuchi}</b></span><span>お菓子 <b>{counts.sweets}</b></span>{showMochida && <span>もちだ <b>{counts.mochida}</b></span>}
      </button>
      {Array.from({ length: FIELD_SLOTS }, (_, slot) => <FieldSlot key={slot} side={side} slot={slot} />)}
    </div>
    {!near && <div className={`${styles.opponentHand} ${open ? styles.openHand : ''} ${mixed ? styles.opponentHandWithRevealed : ''}`} role="group" aria-label={`相手の手札 ${player.hand.length}枚`}>
      {[...concealed, ...revealed].map((uid, i) => {
        const card = game.cards[uid], face = displayCards[card.cardId], visible = !!face && (card.revealed || open);
        return <button key={uid} type="button" data-hand={uid} data-revealed={card.revealed || undefined}
          className={`${styles.hiddenCard} ${card.revealed ? styles.revealedOpponentCard : ''} ${board.flying(uid) ? styles.dealing : ''}`}
          disabled={!visible} aria-label={visible ? `相手の${card.revealed ? '公開' : ''}手札 ${face.name}` : '相手の非公開手札'}
          onClick={() => board.setPanel(editing ? { type: 'editHand', uid } : { type: 'inspect', uid })}
          style={{ '--hand-index': i - (player.hand.length - 1) / 2, '--fan-step': `${Math.min(56, 360 / Math.max(1, player.hand.length))}px`, '--reveal-shift': mixed ? card.revealed ? 'calc((104px - var(--fan-step) + 32px) / 2)' : 'calc((var(--fan-step) - 104px - 32px) / 2)' : '0px' } as CSSProperties}>
          {/* The opponent holds their cards facing them, so they are upside down from here. */}
          <span className={styles.hiddenFace}>{visible && <GameCard id={card.cardId} />}</span>
          {card.revealed && <span className={styles.revealed}>公開</span>}
        </button>;
      })}
      {editing && <button className={styles.addFarHand} aria-label="相手の手札に加える" onClick={() => board.setPicking({ side, zone: 'hand' })}>＋</button>}
    </div>}
  </section>;
}

/** Deck stacks draw when a draw is pending; nap / exile open their list. */
function Zone({ side, kind, className }: { side: Side; kind: ZoneKind; className: string }) {
  const board = useBoardContext();
  const player = board.game.players[side];
  const deck = kind === 'yojo' || kind === 'sweet';
  const inspect = deck && board.mode === 'puzzle' ? () => board.setPanel({ type: 'zone', side, kind }) : undefined;
  const drawing = deck && board.deckReady(side, kind as DeckKind);
  const thresholdDraw = drawing && !board.editing && !board.replaying && kind === 'sweet'
    && board.game.pending?.task.text === 'threshold';
  return <div className={className}>
    <DeckStack side={side} kind={kind} ids={player[kind]} thresholds={player.milestones} enabled={deck ? drawing || board.editing || !!inspect : true} drawing={drawing} thresholdDraw={thresholdDraw}
      onInspect={inspect}
      onClick={() => board.editing ? board.setPanel({ type: 'editPile', side, kind }) : deck ? drawing ? board.clickDeck(side, kind as DeckKind) : inspect?.() : board.setPanel({ type: 'zone', side, kind })} />
  </div>;
}

function FieldSlot({ side, slot }: { side: Side; slot: number }) {
  const board = useBoardContext();
  const { game, view, attacker, selected, playEnabled, drag, animations, editing } = board;
  const near = side === view;
  const longPress = useLongPress();
  const uid = game.players[side].field.find(id => game.cards[id].slot === slot), card = uid ? game.cards[uid] : null;
  const targeting = !!uid && (board.isOption(uid) || !!attacker && side !== view && board.canStrike(attacker, uid));
  const placing = !!selected && near && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo';
  const classes = [
    styles.fieldSlot, card && styles.occupied, (targeting || placing) && styles.targetable, uid === attacker && styles.attacking,
    card?.exhausted && styles.exhausted, uid && (drag.held?.uid === uid || animations.strike?.uid === uid) && styles.dealing,
    card?.keywords.includes('taunt') && styles.tauntCard, editing && !card && styles.editSlot,
  ].filter(Boolean).join(' ');
  // Touch and hold enlarges a unit, like the right click.
  const hold = longPress(() => { if (uid) { drag.cancel(); board.setPanel({ type: 'inspect', uid }); } });
  return <button data-slot={slot} data-side={side} data-unit={uid} disabled={!!attacker && side !== view && !targeting} className={classes}
    aria-label={`${side === 0 ? 'あなた' : '相手'}の場 ${slot + 1} ${card ? displayCards[card.cardId].name : '空き'}`}
    {...hold}
    onClick={() => { if (!drag.clickSuppressed()) board.clickSlot(side, uid, slot); }}
    onPointerDown={event => { if (uid) hold.onPointerDown(event); if (uid && near) drag.pickUp(event, uid, 'field'); }}
    onContextMenu={event => { event.preventDefault(); if (uid) board.setPanel({ type: 'inspect', uid }); }}>
    {card && <>
      <GameCard id={card.cardId} instance={card} abilities />
      {editing && card.entered === game.turn && <span className={styles.editFlag}>出たばかり</span>}
      {!card.exhausted && board.canAttackNow(uid!) && <span className={styles.readyGem} />}
    </>}
  </button>;
}
