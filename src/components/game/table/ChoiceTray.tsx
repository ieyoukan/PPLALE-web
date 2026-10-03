'use client';

import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/**
 * Prompt for the pending effect choice. Units, hand cards and decks are picked in place on the
 * table (see `pendingView`); only the remaining options appear here as buttons.
 */
export function ChoiceTray() {
  const { pending, ours, busy, choose } = useBoardContext();
  if (!pending || !ours || pending.decks.length) return null;
  return <div className={`${styles.choiceTray} ${pending.hand.length ? styles.choiceTrayTop : ''}`} role="status">
    <strong>{pending.prompt}</strong>
    {pending.buttons.map(option => <button key={option.id} disabled={busy} onClick={() => choose(option.id)}>
      {option.cardId ? <span className={styles.choiceThumb}><GameCard id={option.cardId} /></span> : option.label}
    </button>)}
  </div>;
}
