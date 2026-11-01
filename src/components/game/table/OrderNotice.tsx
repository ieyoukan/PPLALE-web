'use client';

import { cpuProfiles, other } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { cpuSidesOf } from '@/lib/game/sessionStore';
import { useI18n } from '@/i18n/LocaleProvider';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from './MatchScreens.module.css';

/**
 * Once the order is decided, over the blurred table: the other side on top and the viewer at the
 * bottom (as on the table), each with its playable card, its name and a 先攻 / 後攻 plate.
 */
export function OrderNotice() {
  const { game, view, mode, levels, names, animations: { order } } = useBoardContext();
  const { locale, t, gameText } = useI18n();
  if (!order) return null;
  const word = (side: Side) => side === order.first ? '先攻' : '後攻';
  // The plate stacks the two kanji; another language shows its word whole.
  const plate = (side: Side) => locale === 'ja' ? <><span aria-hidden="true">{word(side)[0]}</span><span aria-hidden="true">{word(side)[1]}</span></> : <span aria-hidden="true">{t(word(side))}</span>;
  const row = (side: Side, edge: 'top' | 'bottom') => <div className={`${styles.versusSide} ${edge === 'top' ? styles.versusTop : styles.versusBottom}`}>
    <div className={styles.versusCard}><GameCard id={game.players[side].playable} sizes="(max-width: 640px) 34vw, 260px" /></div>
    <div className={styles.versusInfo}>
      <span className={styles.playerText}>
        <small>{cpuSidesOf(mode).includes(side) ? `CPU · ${gameText(cpuProfiles[levels[side]].name)}` : 'PLAYER'}</small>
        <b>{t(names[side])}</b>
      </span>
      <div className={`${styles.orderPlate} ${side === order.first ? styles.plateFirst : styles.plateSecond}`}>
        <strong aria-label={t(word(side))}>{plate(side)}</strong>
      </div>
    </div>
  </div>;
  return <div className={styles.versus} role="status" aria-live="polite">
    {row(other(view), 'top')}
    <div className={styles.versusMiddle}>
      <i className={styles.versusBeam} aria-hidden="true" />
      <span className={styles.versusMark} aria-hidden="true">VS</span>
      <p className={styles.versusCaption}>{t(order.chooser === order.first ? '{name}が先攻をえらびました' : '{name}が後攻をえらびました', { name: t(names[order.chooser]) })}</p>
    </div>
    {row(view, 'bottom')}
  </div>;
}
