'use client';

// How a room's matches are played (対戦の進め方): one labelled row per rule — who goes first (the
// dice, or a seat the owner fixes), the opening hand sizes, and the 後攻's extra 2PP on its 5th turn.
// A rule changed from the official one is marked, and one button puts them all back.
// Every rule left at the official value is left out of the rules (game-core `parsePlayRules`).
import { OFFICIAL_OPENING_HAND, OPENING_HAND_RANGE, officialPlay, parsePlayRules } from '@pplale/game-core';
import type { PlayRules, Side } from '@pplale/game-core';
import type { ReactNode } from 'react';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './PlayRulesPicker.module.css';

/** A die showing three: the dice decide the order. */
function Die() {
  return <svg className={styles.die} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <circle cx="8.5" cy="8.5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="15.5" cy="15.5" r="1.7" />
  </svg>;
}
/** `count` card backs side by side. */
const Backs = ({ count }: { count: number }) =>
  <span className={styles.backs} aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</span>;
/** The white marble the table shows on the 後攻's 5th turn; struck through when there is none. */
const Marble = ({ off }: { off?: boolean }) => <span className={styles.marble} data-off={off || undefined} aria-hidden="true">+2</span>;

/** One rule: its name on the left (marked when it differs from the official rule), its choices on the right. */
function Row({ name, changed, children }: { name: string; changed: boolean; children: ReactNode }) {
  return <div className={styles.row} data-changed={changed || undefined}>
    <span className={styles.rowName}>{name}</span>
    <div className={styles.choices}>{children}</div>
  </div>;
}

export function PlayRulesPicker({ rules, seats, onChange }: {
  rules: PlayRules;
  /** Who sits in each seat now (undefined: empty), to name the seat that goes first. */
  seats: [string | undefined, string | undefined];
  onChange: (rules: PlayRules) => void;
}) {
  const { t } = useI18n();
  const play = parsePlayRules(rules);
  const hand = play.openingHand ?? OFFICIAL_OPENING_HAND;
  const change = (next: PlayRules) => onChange(parsePlayRules({ ...play, ...next }));
  const setHand = (order: 0 | 1, size: number) => change({ openingHand: (order === 0 ? [size, hand[1]] : [hand[0], size]) as [number, number] });
  const seatName = (seat: Side) => seats[seat] ?? t('席{n}', { n: seat + 1 });
  const stepper = (order: 0 | 1) => {
    const size = hand[order];
    return <div className={styles.stepper} role="group" aria-label={t(order === 0 ? '先攻の初期手札' : '後攻の初期手札')}>
      <span className={styles.orderPlate} data-order={order === 0 ? 'first' : 'second'}>{t(order === 0 ? '先攻' : '後攻')}</span>
      <button type="button" aria-label={t('1枚へらす')} disabled={size <= OPENING_HAND_RANGE.min} onClick={() => setHand(order, size - 1)}>−</button>
      <span className={styles.count} data-changed={size !== OFFICIAL_OPENING_HAND[order] || undefined} aria-live="polite">
        <Backs count={size} /><b>{t('{n}枚', { n: size })}</b>
      </span>
      <button type="button" aria-label={t('1枚ふやす')} disabled={size >= OPENING_HAND_RANGE.max} onClick={() => setHand(order, size + 1)}>+</button>
    </div>;
  };
  const boost = play.secondBoost !== false;
  return <fieldset className={styles.picker}>
    <legend>
      {t('対戦の進め方')}
      {!officialPlay(play) && <button type="button" className={styles.reset} onClick={() => onChange({})}><GameIcon name="history" />{t('公式ルールにもどす')}</button>}
    </legend>
    <Row name={t('先攻')} changed={play.firstSeat !== undefined}>
      <div className={styles.options} role="radiogroup" aria-label={t('先攻の決め方')}>
        <button type="button" role="radio" aria-checked={play.firstSeat === undefined} onClick={() => change({ firstSeat: undefined })}><Die />{t('ダイス')}</button>
        {([0, 1] as const).map(seat => <button key={seat} type="button" role="radio" aria-checked={play.firstSeat === seat} aria-label={t('{name}が先攻', { name: seatName(seat) })}
          onClick={() => change({ firstSeat: seat })}>
          <GameIcon name="seat" /><span className={styles.seatName}>{seatName(seat)}</span>
        </button>)}
      </div>
    </Row>
    <Row name={t('初期手札')} changed={play.openingHand !== undefined}>
      {stepper(0)}{stepper(1)}
    </Row>
    <Row name={t('後攻5ターン目の+2PP')} changed={!boost}>
      <div className={styles.options} role="radiogroup" aria-label={t('後攻5ターン目の追加2PP')}>
        <button type="button" role="radio" aria-checked={boost} onClick={() => change({ secondBoost: undefined })}><Marble />{t('あり')}</button>
        <button type="button" role="radio" aria-checked={!boost} onClick={() => change({ secondBoost: false })}><Marble off />{t('なし')}</button>
      </div>
    </Row>
  </fieldset>;
}
