'use client';

import { displayCards } from '@/lib/game/catalog';
import { sideName, useBoardContext } from '../board/BoardContext';
import { OpeningDie } from '../OpeningDie';
import styles from '../BoardEmulator.module.css';

/** What a card's roll means, shown under the die once it lands. */
const meanings: Record<string, (value: number) => string> = {
  y_18: value => Math.floor(value / 2) ? `${Math.floor(value / 2)}枚捨てる` : '0枚なので何も起きない',
};

/** A die rolled by a card effect (ぎってぃ), thrown over the table like the opening dice. */
export function EffectDie() {
  const board = useBoardContext();
  const roll = board.animations.effectRoll;
  if (!roll) return null;
  const name = roll.cardId ? displayCards[roll.cardId]?.name : undefined;
  const meaning = !roll.rolling && roll.cardId ? meanings[roll.cardId]?.(roll.value) : undefined;
  return <div className={styles.effectDie} role="status" aria-live="polite">
    <span>{sideName(board, roll.side)}{name ? `・${name}` : ''}のダイス</span>
    <OpeningDie value={roll.value} rolling={roll.rolling} interactive={false} label={name ?? 'カード'} onRoll={() => {}} />
    {!roll.rolling && <strong>{roll.value}{meaning ? ` → ${meaning}` : ''}</strong>}
  </div>;
}
