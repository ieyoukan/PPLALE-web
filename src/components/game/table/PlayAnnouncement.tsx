'use client';

import type { CSSProperties } from 'react';
import { sideName, useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const verb = { play: 'プレイ', skill: 'スキル', reveal: '公開' } as const;

/** The opponent's card / skill, large, with its text — shown before it resolves. */
export function PlayAnnouncement() {
  const board = useBoardContext();
  const shown = board.animations.announcement;
  if (!shown) return null;
  const who = sideName(board, board.view === 0 ? 1 : 0);
  return <div key={shown.id} className={styles.announcement} role="status" aria-live="assertive">
    <div className={styles.announcementCard}><GameCard id={shown.cardId} /></div>
    <div className={styles.announcementText}>
      <small>{who}の{verb[shown.kind]}</small>
      <strong>{shown.title}</strong>
      {shown.text && <p>{shown.text}</p>}
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
