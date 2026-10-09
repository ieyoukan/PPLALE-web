'use client';

import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/**
 * Prompt for the pending effect choice. Units, hand cards and decks are picked in place on the
 * table (see `pendingView`); only the remaining options appear here as buttons.
 */
export function ChoiceTray() {
  const { pending, ours, busy, choose, animations } = useBoardContext();
  if (!pending || !ours || animations.announcement?.kind === 'reaction' || pending.decks.length && !pending.buttons.length) return null;
  if (pending.reveal) return <div className={styles.revealComplete}>
    <button type="button" disabled={busy} onClick={() => choose('done')}>公開を完了</button>
  </div>;
  return <div className={styles.choiceTray} role="status">
    {!pending.decks.length && <strong>{pending.prompt}</strong>}
    {pending.buttons.map(option => <button key={option.id} disabled={busy} onClick={() => choose(option.id)}>
      {option.cardId ? <span className={styles.choiceThumb}><GameCard id={option.cardId} /></span> : option.label}
    </button>)}
  </div>;
}
