'use client';

import { availablePpMaximum } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import type { DeckKind, Side } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { useBoardContext } from '../board/BoardContext';
import { useLongPress } from '../board/useLongPress';
import { Counter, DeckStack } from '../BoardPieces';
import type { ZoneKind } from '../BoardPieces';
import { CardChoiceMark } from './ChoiceTray';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const FIELD_SLOTS = 7;

/** One player's half of the table: decks, piles, playable, counters, field and (far side) hand backs. */
export function PlayerSide({ side }: { side: Side }) {
  const board = useBoardContext();
  const { game, view, mode, busy, attacker, attackLeader, remote, editing } = board;
  const { t } = useI18n();
  const cardName = useCardName();
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
  return <section className={`${styles.playerSide} ${near ? styles.near : styles.far}`} aria-label={t(`${who}の盤面`)}>
    <Zone side={side} kind="yojo" className={styles.deckYojo} />
    <Zone side={side} kind="sweet" className={styles.deckSweet} />
    <Zone side={side} kind="nap" className={styles.napZone} />
    <Zone side={side} kind="exile" className={styles.exileZone} />
    <button className={styles.playableZone} onClick={() => board.setPanel(editing ? { type: 'editPlayer', side } : { type: 'skills', side })} aria-label={t(editing ? `${who}の設定` : `${who}のスキル`)}>
      <span className={styles.playableCard}><GameCard id={player.playable} sizes="90px" /></span>
    </button>
    <div className={styles.turnCounter}>
      {/* Edit mode: the number shown (the turn count) is what the buttons change, and the PP is filled to the
          new maximum as at the start of a turn; the rest of the player is behind the label. */}
      {editing
        ? <Counter label={t('ターン数(+pp)')} value={player.turns} bonus={player.ppBonus} pp={`${player.pp} / ${availablePpMaximum(game, side)}`} test adjusts={t('ターン数')}
          onClick={() => board.setPanel({ type: 'editPlayer', side })}
          onAdjust={delta => board.edit({ type: 'player', side, turns: player.turns + delta, pp: player.turns + delta + player.ppBonus })} onReset={() => board.edit({ type: 'player', side, turns: 1, ppBonus: 0, pp: 1 })} />
        : <Counter label={t('ターン数(+pp)')} value={player.turns} bonus={player.ppBonus} temporaryBonus={player.turnPpBonus} pp={`${player.pp} / ${availablePpMaximum(game, side)}`} test={sandbox}
          onAdjust={delta => board.adjust(side, 'ppBonus', delta)} onReset={() => board.adjust(side, 'ppBonus', -player.ppBonus)} />}
    </div>
    <div className={styles.pointsCounter} data-leader={side}>
      <Counter label={t('お菓子ポイント')} value={player.points} points target={leaderTarget} test={sandbox} onClick={editing ? () => board.setPanel({ type: 'editPlayer', side }) : attackLeader}
        onAdjust={delta => board.adjust(side, 'points', delta)} onReset={() => board.adjust(side, 'points', player.maxPoints - player.points)} />
      {player.shield && <span className={styles.shieldIndicator}>{t('パンケーキ保護')}</span>}
    </div>
    <div className={styles.field}>
      {Array.from({ length: FIELD_SLOTS }, (_, slot) => <FieldSlot key={slot} side={side} slot={slot} />)}
    </div>
    {!near && <div className={`${styles.opponentHand} ${open ? styles.openHand : ''} ${mixed ? styles.opponentHandWithRevealed : ''}`} role="group" aria-label={t('相手の手札 {count}枚', { count: player.hand.length })}>
      {[...concealed, ...revealed].map((uid, i) => {
        const card = game.cards[uid], face = displayCards[card.cardId], visible = !!face && (card.revealed || open);
        return <button key={uid} type="button" data-hand={uid} data-revealed={card.revealed || undefined}
          className={`${styles.hiddenCard} ${card.revealed ? styles.revealedOpponentCard : ''} ${board.flying(uid) ? styles.dealing : ''}`}
          disabled={!visible} aria-label={visible ? t(card.revealed ? '相手の公開手札 {name}' : '相手の手札 {name}', { name: cardName(card.cardId, face.name) }) : t('相手の非公開手札')}
          onClick={() => board.setPanel(editing ? { type: 'editHand', uid } : { type: 'inspect', uid })}
          style={{ '--hand-index': i - (player.hand.length - 1) / 2, '--fan-step': `${Math.min(56, 360 / Math.max(1, player.hand.length))}px`, '--reveal-shift': mixed ? card.revealed ? 'calc((104px - var(--fan-step) + 32px) / 2)' : 'calc((var(--fan-step) - 104px - 32px) / 2)' : '0px' } as CSSProperties}>
          {/* The opponent holds their cards facing them, so they are upside down from here. */}
          <span className={styles.hiddenFace}>{visible && <GameCard id={card.cardId} />}</span>
          {card.revealed && <span className={styles.revealed}>{t('公開')}</span>}
        </button>;
      })}
      {editing && <button className={styles.addFarHand} aria-label={t('相手の手札に加える')} onClick={() => board.setPicking({ side, zone: 'hand' })}>＋</button>}
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
  const { t } = useI18n();
  const cardName = useCardName();
  const uid = game.players[side].field.find(id => game.cards[id].slot === slot), card = uid ? game.cards[uid] : null;
  const pending = board.pendingPlay?.side === side && board.pendingPlay.slot === slot ? board.pendingPlay : null;
  const displayed = card?.cardId ?? pending?.cardId;
  const choiceSelected = !!uid && board.cardChoice.selected.includes(uid);
  const targeting = !!uid && (board.isOption(uid) || !!attacker && side !== view && board.canStrike(attacker, uid));
  const placing = !!selected && near && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo';
  const classes = [
    styles.fieldSlot, (card || pending) && styles.occupied, (targeting || placing) && styles.targetable, uid === attacker && styles.attacking,
    card?.exhausted && styles.exhausted, uid && (drag.held?.uid === uid || animations.strike?.uid === uid) && styles.dealing,
    card?.keywords.includes('taunt') && styles.tauntCard, editing && !card && styles.editSlot,
  ].filter(Boolean).join(' ');
  // Touch and hold enlarges a unit, like the right click.
  const hold = longPress(() => { if (uid) { drag.cancel(); board.setPanel({ type: 'inspect', uid }); } });
  return <button data-slot={slot} data-side={side} data-unit={uid} data-choice-selected={choiceSelected || undefined} aria-pressed={uid && board.cardChoice.selection?.candidates.includes(uid) ? choiceSelected : undefined} data-pending-play={pending?.uid} aria-busy={!!pending || undefined} disabled={!!pending || !!attacker && side !== view && !targeting} className={classes}
    aria-label={t(side === 0 ? 'あなたの場 {slot} {card}' : '相手の場 {slot} {card}', { slot: slot + 1, card: displayed ? cardName(displayed, displayCards[displayed].name) : t('空き') })}
    {...hold}
    onClick={() => { if (!drag.clickSuppressed()) board.clickSlot(side, uid, slot); }}
    onPointerDown={event => { if (uid) hold.onPointerDown(event); if (uid && near) drag.pickUp(event, uid, 'field'); }}
    onContextMenu={event => { event.preventDefault(); if (uid) board.setPanel({ type: 'inspect', uid }); }}>
    {choiceSelected && board.cardChoice.selection && <CardChoiceMark kind={board.cardChoice.selection.kind} />}
    {displayed && <>
      <GameCard id={displayed} instance={card ?? undefined} abilities={!!card} />
      {editing && card && card.entered === game.turn && <span className={styles.editFlag}>{t('出たばかり')}</span>}
      {card && !card.exhausted && board.canAttackNow(uid!) && <span className={styles.readyGem} />}
    </>}
  </button>;
}
