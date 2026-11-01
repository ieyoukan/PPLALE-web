'use client';

import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import type { CardSelection } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/**
 * Prompt for the pending effect choice. Units, hand cards and decks are picked in place on the
 * table (see `pendingView`); only the remaining options appear here as buttons.
 */
export function ChoiceTray() {
  const { pending, ours, busy, choose, animations, cardChoice } = useBoardContext();
  const { t, gameText } = useI18n();
  const cardName = useCardName();
  if (!pending || !ours || animations.announcement?.kind === 'reaction' || pending.decks.length && !pending.buttons.length) return null;
  if (pending.reveal) return <div className={`${styles.revealComplete} ${styles.choiceCompletion}`}>
    <button type="button" disabled={busy} onClick={() => choose('done')}>{t('公開を完了')}</button>
  </div>;
  if (cardChoice.selection) {
    const { selection, selected, canConfirm, confirm } = cardChoice;
    const outside = pending.buttons.filter(option => selection.candidates.includes(option.id));
    const buttons = pending.buttons.filter(option => !option.cardId && option.id !== selection.finish);
    const label = selection.kind === 'activate' ? t('発動する')
      : selection.optional && !selected.length ? t('選ばずに完了')
      : t(completionLabels[selection.kind], { n: selected.length });
    return <div className={styles.cardChoice} role="group" aria-label={t('カードを選んで確定')}>
      <strong>{gameText(pending.prompt)}</strong>
      {outside.length > 0 && <div className={styles.choiceCandidates}>
        {outside.map(option => <button key={option.id} className={styles.choiceCard} data-choice-card={option.id} disabled={busy} aria-label={cardName(option.cardId!, option.label)}
          aria-pressed={selected.includes(option.id)} data-choice-selected={selected.includes(option.id) || undefined} onClick={() => choose(option.id)}>
          <GameCard id={option.cardId!} />
          {selected.includes(option.id) && <CardChoiceMark kind={selection.kind} />}
        </button>)}
      </div>}
      <div className={styles.choiceCompletion}>
        <button type="button" disabled={!canConfirm} onClick={confirm}>{label}</button>
        {buttons.map(option => <button key={option.id} disabled={busy} onClick={() => choose(option.id)}>{gameText(option.label)}</button>)}
        {selection.min === selection.max && selection.max > 1 && <small>{selected.length} / {selection.max}</small>}
      </div>
    </div>;
  }
  return <div className={styles.choiceTray} role="status">
    {!pending.decks.length && <strong>{gameText(pending.prompt)}</strong>}
    {pending.buttons.map(option => <button key={option.id} disabled={busy} onClick={() => choose(option.id)}>
      {option.cardId ? <span className={styles.choiceThumb}><GameCard id={option.cardId} /></span> : gameText(option.label)}
    </button>)}
  </div>;
}

const completionLabels = { discard: 'お昼寝に送る（{n}枚）', exile: '除外する（{n}枚）', give: '相手へ渡す（{n}枚）' } as const;
const selectionLabels = { discard: 'お昼寝予定', exile: '除外予定', activate: '選択中', give: '渡す予定' } as const;
/** 手札・場・候補一覧で同じ仮選択マークを使う。 */
export function CardChoiceMark({ kind }: { kind: CardSelection['kind'] }) {
  const { t } = useI18n();
  return <span className={styles.choiceMark}>✓ {t(selectionLabels[kind])}</span>;
}
