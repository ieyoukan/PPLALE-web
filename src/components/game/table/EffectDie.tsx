'use client';

import { displayCards } from '@/lib/game/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import type { Translate } from '@/lib/game/sessionStore';
import { sideName, useBoardContext } from '../board/BoardContext';
import { OpeningDie } from '../OpeningDie';
import styles from '../BoardEmulator.module.css';

/** What a card's roll means, shown under the die once it lands. */
const meanings: Record<string, (value: number, t: Translate) => string> = {
  y_18: (value, t) => Math.floor(value / 2) ? t('{count}枚捨てる', { count: Math.floor(value / 2) }) : t('0枚なので何も起きない'),
};

/** A die rolled by a card effect (ぎってぃ), thrown over the table like the opening dice. */
export function EffectDie() {
  const board = useBoardContext();
  const roll = board.animations.effectRoll;
  const { t } = useI18n();
  const cardName = useCardName();
  if (!roll) return null;
  const japaneseName = roll.cardId ? displayCards[roll.cardId]?.name : undefined;
  const name = roll.cardId && japaneseName ? cardName(roll.cardId, japaneseName) : undefined;
  const meaning = !roll.rolling && roll.cardId ? meanings[roll.cardId]?.(roll.value, t) : undefined;
  const who = t(sideName(board, roll.side));
  return <div className={styles.effectDie} role="status" aria-live="polite">
    <span>{name ? t('{who}・{card}のダイス', { who, card: name }) : t('{who}のダイス', { who })}</span>
    <OpeningDie value={roll.value} rolling={roll.rolling} interactive={false} label={name ?? t('カード')} onRoll={() => {}} />
    {!roll.rolling && <strong>{roll.value}{meaning ? ` → ${meaning}` : ''}</strong>}
  </div>;
}
