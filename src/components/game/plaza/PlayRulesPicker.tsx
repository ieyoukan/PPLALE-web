'use client';

// How a room's matches are played (対戦の進め方): a template, then each rule on its own — who goes
// first (the dice, or a seat the owner fixes), the opening hand sizes, and the 後攻's extra 2PP on its
// 5th turn. Shown with the table's own pieces (a die, card backs, the white +2 marble) rather than words.
// Every rule left at the official value is left out of the rules (game-core `parsePlayRules`).
import { applyPreset, OFFICIAL_OPENING_HAND, OPENING_HAND_RANGE, parsePlayRules, playPresets, presetOf } from '@pplale/game-core';
import type { PlayRules, Side } from '@pplale/game-core';
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

/** A template's look: the order, the two opening hands and the marble, in small. */
function PresetFace({ rules }: { rules: PlayRules }) {
  const play = parsePlayRules(rules), hand = play.openingHand ?? OFFICIAL_OPENING_HAND;
  return <span className={styles.presetFace} aria-hidden="true">
    {play.firstSeat === undefined ? <Die /> : <b className={styles.firstMark}>先</b>}
    <span className={styles.hands}>{hand[0]}<small>|</small>{hand[1]}</span>
    <Marble off={play.secondBoost === false} />
  </span>;
}

export function PlayRulesPicker({ rules, seats, onChange }: {
  rules: PlayRules;
  /** Who sits in each seat now (undefined: empty), to name the seat that goes first. */
  seats: [string | undefined, string | undefined];
  onChange: (rules: PlayRules) => void;
}) {
  const { t } = useI18n();
  const play = parsePlayRules(rules), chosen = presetOf(play);
  const hand = play.openingHand ?? OFFICIAL_OPENING_HAND;
  const change = (next: PlayRules) => onChange(parsePlayRules({ ...play, ...next }));
  const setHand = (order: 0 | 1, size: number) => change({ openingHand: (order === 0 ? [size, hand[1]] : [hand[0], size]) as [number, number] });
  const seatName = (seat: Side) => seats[seat] ?? t('席{n}', { n: seat + 1 });
  const stepper = (order: 0 | 1) => {
    const label = t(order === 0 ? '先攻' : '後攻'), size = hand[order];
    return <div className={styles.stepper} role="group" aria-label={t(order === 0 ? '先攻の初期手札' : '後攻の初期手札')}>
      <span className={styles.orderPlate} data-order={order === 0 ? 'first' : 'second'}>{label}</span>
      <button type="button" aria-label={t('1枚へらす')} disabled={size <= OPENING_HAND_RANGE.min} onClick={() => setHand(order, size - 1)}>−</button>
      <span className={styles.count} data-changed={size !== OFFICIAL_OPENING_HAND[order] || undefined} aria-live="polite">
        <Backs count={size} /><b>{t('{n}枚', { n: size })}</b>
      </span>
      <button type="button" aria-label={t('1枚ふやす')} disabled={size >= OPENING_HAND_RANGE.max} onClick={() => setHand(order, size + 1)}>+</button>
    </div>;
  };
  return <fieldset className={styles.picker}>
    <legend>{t('対戦の進め方')}</legend>
    <div className={styles.presets} role="radiogroup" aria-label={t('テンプレート')}>
      {playPresets.map(preset => <button key={preset.id} type="button" role="radio" aria-checked={chosen === preset.id}
        onClick={() => onChange(applyPreset(play, preset.id))}>
        <PresetFace rules={preset.rules} />
        <span className={styles.presetName}>{t(preset.name)}</span>
      </button>)}
      {/* Shown only while the rules match no template; it cannot be chosen, it only says so. */}
      {chosen === null && <span className={styles.custom} role="radio" aria-checked="true" aria-disabled="true">
        <PresetFace rules={play} />
        <span className={styles.presetName}>{t('カスタム')}</span>
      </span>}
    </div>
    <div className={styles.rows}>
      <div className={styles.row} role="radiogroup" aria-label={t('先攻の決め方')}>
        <span className={styles.rowIcon} aria-hidden="true"><b className={styles.firstMark}>先</b></span>
        <button type="button" role="radio" aria-checked={play.firstSeat === undefined} aria-label={t('ダイスで決める')} onClick={() => change({ firstSeat: undefined })}><Die /></button>
        {([0, 1] as const).map(seat => <button key={seat} type="button" role="radio" aria-checked={play.firstSeat === seat} aria-label={t('{name}が先攻', { name: seatName(seat) })}
          onClick={() => change({ firstSeat: seat })}>
          <GameIcon name="seat" /><span className={styles.seatName}>{seatName(seat)}</span>
        </button>)}
      </div>
      <div className={styles.row}>
        <span className={styles.rowIcon} aria-hidden="true"><GameIcon name="cards" /></span>
        <div className={styles.steppers}>{stepper(0)}{stepper(1)}</div>
      </div>
      <div className={styles.row}>
        <span className={styles.rowIcon} aria-hidden="true"><span className={styles.turnFive}>{t('後攻')}<b>5</b></span></span>
        <button type="button" role="switch" aria-checked={play.secondBoost !== false} aria-label={t('後攻5ターン目の追加2PP')} className={styles.boost}
          onClick={() => change({ secondBoost: play.secondBoost === false ? undefined : false })}>
          <Marble off={play.secondBoost === false} />
        </button>
      </div>
    </div>
  </fieldset>;
}
