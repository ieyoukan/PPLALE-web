'use client';

import { canPlay, costOf, isRevealable } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { HAND_CARD_SIZES } from '@/lib/game/cardImages';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { useBoardContext } from '../board/BoardContext';
import { sleeveBackground } from '@/lib/game/sleeves';
import { CardChoiceMark } from './ChoiceTray';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/** Revealed cards and reversible reveal selections share the area beside the hand. */
export function HandDock() {
  const board = useBoardContext();
  const { game, view, me, selected, drag, mulligan, remote, editing, pending, ours, busy, intent } = board;
  const { t } = useI18n();
  const cardName = useCardName();
  // The mulligan screen shows the hand itself, except while its replacements are drawn from the table.
  // (A spectator has no mulligan screen, so the hand stays on the table.)
  if (!me.hand.length && !editing || game.phase === 'mulligan' && !mulligan.remaining && !remote?.watching) return null;
  const revealChoice = ours && pending?.actor === view ? pending.reveal : undefined;
  const revealing = !!revealChoice, draft = revealChoice?.selected ?? [];
  const inRevealedGroup = (uid: string) => game.cards[uid].revealed || draft.includes(uid);
  const concealed = me.hand.filter(uid => !inRevealedGroup(uid));
  const revealed = me.hand.filter(inRevealedGroup);
  const mixed = concealed.length > 0 && revealed.length > 0;
  return <div className={styles.handDock} style={{ '--sleeve-image': sleeveBackground(board.sleeves[board.view]) } as CSSProperties}>
    <div className={styles.hand} data-hand-list>{[...concealed, ...revealed].map((uid, index) => {
      const card = game.cards[uid], face = displayCards[card.cardId], preview = draft.includes(uid), grouped = inRevealedGroup(uid);
      // Respect the supplied view: a hidden identity has no picture or inspection action.
      const hidden = !face;
      const groupIndex = grouped ? index - concealed.length : index;
      const offset = groupIndex - ((grouped ? revealed.length : concealed.length) - 1) / 2;
      const angleLimit = mixed ? 8 : 16;
      const classes = [
        styles.handCard, !hidden && board.affordable(uid) && styles.playableHand, selected === uid && styles.selectedHand,
        board.isOption(uid) && styles.targetable, (board.flying(uid) || board.pendingPlay?.uid === uid || drag.held?.uid === uid && !drag.held.aim) && styles.dealing, drag.held?.uid === uid && drag.held.aim && styles.aimingCard,
        grouped && styles.revealedHandCard, mixed && index === concealed.length && styles.revealedHandStart,
      ].filter(Boolean).join(' ');
      const choiceSelected = board.cardChoice.selected.includes(uid);
      const choiceCandidate = board.cardChoice.selection?.candidates.includes(uid);
      const submitting = intent && 'uid' in intent && intent.uid === uid;
      return <button key={uid} data-hand={uid} data-choice-selected={choiceSelected || undefined} data-concealed={hidden || undefined} data-submitting={submitting || undefined} aria-busy={submitting || undefined} data-revealed={card.revealed || undefined} data-reveal-pending={preview || undefined} className={classes}
        disabled={hidden || choiceCandidate && busy || revealing && (!board.isOption(uid) || busy)} aria-pressed={choiceCandidate ? choiceSelected : revealing && board.isOption(uid) ? preview : undefined}
        style={{ '--angle': `${Math.max(-angleLimit, Math.min(angleLimit, offset * 4))}deg`, '--lift': `${Math.min(35, Math.abs(offset) * 7)}px`, '--overlap': `${Math.min(100, Math.max(40, (me.hand.length - 4) * 13))}px`, zIndex: index } as CSSProperties}
        aria-label={hidden ? t('非公開の手札') : t('手札 {name}', { name: cardName(card.cardId, face.name) }) + (preview ? t('（公開予定）') : card.revealed ? t('（公開）') : '')} onPointerDown={event => { if (!hidden && !remote?.watching) drag.pickUp(event, uid, 'hand'); }}
        onClick={() => {
          if (hidden || drag.clickSuppressed()) return;
          if (remote?.watching) board.setPanel({ type: 'inspect', uid });
          else board.clickHand(uid);
        }}>
        {!hidden && <GameCard id={card.cardId} instance={card} currentCost={costOf(game, uid, gameCatalog, view)} sizes={HAND_CARD_SIZES} />}
        {grouped && !choiceSelected && <span className={styles.revealed}>{t(preview ? '公開予定' : '公開')}</span>}
        {choiceSelected && board.cardChoice.selection && <CardChoiceMark kind={board.cardChoice.selection.kind} />}
      </button>;
    })}
    {editing && <button className={styles.addHand} aria-label={t('手札に加える')} onClick={() => board.setPicking({ side: view, zone: 'hand' })}>＋</button>}
    </div>
  </div>;
}

/** Enlarged selected hand card with its actions (play / reveal). */
export function SelectedCard() {
  const board = useBoardContext();
  const { game, view, me, selected, playEnabled, drag, busy } = board;
  const { t } = useI18n();
  // Hidden while a card is held, so it does not cover the slot being dropped on.
  if (!selected || !me.hand.includes(selected) || game.phase === 'mulligan' || drag.held) return null;
  const card = game.cards[selected], def = gameCatalog[card.cardId], cost = costOf(game, selected, gameCatalog, view);
  const unit = def.type === 'yojo';
  return <aside className={styles.cardSelection} aria-label={t('選んだ手札')}>
    <button className={styles.selectedCardImage} onPointerDown={event => drag.pickUp(event, selected, 'hand')} aria-label={t('選択したカードを持つ')}>
      <GameCard id={card.cardId} instance={card} currentCost={cost} sizes="(max-width: 700px) calc(100vw - 16px), min(calc(100vw - 184px), 67vh)" />
    </button>
    <div className={styles.cardSelectionActions}>
      <button className={styles.primaryAction} disabled={!playEnabled || cost > me.pp || unit && me.field.length >= 7 || !canPlay(game, view, selected, gameCatalog)} onClick={() => board.play(selected)}>{t(unit ? '場に出す' : '使う')}</button>
      {isRevealable(card.cardId) && !card.revealed && game.phase === 'playing' &&
        <button disabled={!!game.pending || busy || !board.canControl(view) || game.winner !== null} onClick={() => board.act({ type: 'reveal', actor: view, uid: selected })}>{t('公開する')}</button>}
      <button onClick={() => board.setSelected(null)}>{t('閉じる')}</button>
    </div>
  </aside>;
}
