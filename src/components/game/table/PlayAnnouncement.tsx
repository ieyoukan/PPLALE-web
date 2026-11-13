'use client';

import type { CSSProperties } from 'react';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { englishCard } from '@/lib/game/skillText';
import { sideName, useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const verb = { play: '{who}のプレイ', skill: '{who}のスキル', reveal: '{who}の公開', reaction: '{who}の手札の効果' } as const;

/** Used cards / skills and either side's hand reactions, shown before they resolve. */
export function PlayAnnouncement() {
  const board = useBoardContext();
  const shown = board.animations.announcement;
  const { locale, t, gameText } = useI18n();
  const cardName = useCardName();
  if (!shown) return null;
  const who = t(sideName(board, shown.side));
  // A played or revealed card is shown by its own name and printed text; skills and reactions are the engine's words.
  const card = shown.kind === 'play' || shown.kind === 'reveal';
  const title = card ? cardName(shown.cardId, shown.title) : gameText(shown.title);
  const text = card && locale === 'en' ? englishCard(shown.cardId)?.effect ?? gameText(shown.text) : gameText(shown.text);
  return <div key={shown.id} className={styles.announcement} role="status" aria-live="assertive">
    <div className={styles.announcementCard}><GameCard id={shown.cardId} sizes="180px" /></div>
    <div className={styles.announcementText}>
      <small>{t(verb[shown.kind], { who })}</small>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  </div>;
}

/** A pulsing ring on the card the opponent picked for an effect. */
export function TargetPing() {
  const ping = useBoardContext().animations.ping;
  if (!ping) return null;
  return <div className={styles.targetPing} aria-hidden="true"
    style={{ left: ping.x, top: ping.y, width: ping.width, height: ping.height } as CSSProperties} />;
}
