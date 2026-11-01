'use client';

import type { Side, Zone } from '@pplale/game-core';
import type { CSSProperties, ReactNode } from 'react';
import { HAND_CARD_SIZES } from '@/lib/game/cardImages';
import { GameCard } from './GameCard';
import { Avatar } from '@/components/shared/player/Avatar';
import { useI18n } from '@/i18n/LocaleProvider';
import type { AvatarIdentity } from '@/components/shared/player/Avatar';
import styles from './BoardEmulator.module.css';
import cue from './DrawCue.module.css';

export type ZoneKind = 'yojo' | 'sweet' | 'nap' | 'exile';
/** The pile's name in words, one column each in the vertical label (「幼女／デッキ」); short words in English. */
const zoneWords = {
  ja: { yojo: ['幼女', 'デッキ'], sweet: ['お菓子', 'デッキ'], nap: ['お昼寝', '場所'], exile: ['除外', 'ゾーン'] },
  en: { yojo: ['Girl', 'deck'], sweet: ['Sweets', 'deck'], nap: ['Nap', 'place'], exile: ['Removed', 'zone'] },
} as const;
/** The one-word name shown above a pile on low screens. */
const zoneShort = { ja: { yojo: '幼女', sweet: 'お菓子', nap: 'お昼寝', exile: '除外' }, en: { yojo: 'Girls', sweet: 'Sweets', nap: 'Nap', exile: 'Removed' } } as const;
export function DeckStack({ side, kind, ids, thresholds = [], enabled, drawing = false, thresholdDraw = false, onClick, onInspect }: {
  side: Side; kind: ZoneKind; ids: string[]; thresholds?: number[];
  enabled: boolean; drawing?: boolean; thresholdDraw?: boolean; onClick: () => void; onInspect?: () => void;
}) {
  const { locale, t } = useI18n();
  const labelWords = zoneWords[locale][kind];
  const label = labelWords.join(locale === 'en' ? ' ' : '');
  const owner = t(side === 0 ? 'あなた' : '相手');
  const helpId = `threshold-draw-${side}`;
  return <><button type="button" data-deck={`${side}-${kind}`} data-threshold-draw={thresholdDraw || undefined} data-label={zoneShort[locale][kind]} className={`${styles.deckZone} ${drawing ? styles.drawReady : ''} ${thresholdDraw ? cue.required : ''}`}
    onClick={onClick} disabled={!enabled} aria-label={t('{owner}の{zone} {n}枚', { owner, zone: label, n: ids.length })} aria-describedby={thresholdDraw ? helpId : undefined}>
    {thresholdDraw && <span className={cue.guide} data-draw-cue>
      <span className={cue.label} id={helpId}>{t('お菓子を1枚引く')}</span>
      <svg viewBox="0 0 160 90" aria-hidden="true"><path d="M8 29H85V8L151 45 85 82V61H8Z" /></svg>
    </span>}
    <span className={styles.zoneLabel}>{labelWords.map(word => <span key={word}>{word}</span>)}</span>
    <span className={styles.stack} data-stack>
      <span className={styles.cardTarget} />
      {ids.map((uid, index) => <span className={styles.stackCard} key={uid}
        style={{ transform: `translate(${index * .18}px, ${-index * .85}px)`, zIndex: index + 1 }} />)}
    </span>
    {kind === 'sweet' && <span className={styles.thresholds}>{[10, 5].map(value => <span key={value}
      className={thresholds.includes(value) ? styles.reached : ''}
      role="img" aria-label={t(thresholds.includes(value) ? '{n}ポイントのドロー機会使用済み' : '{n}ポイントのドロー未達', { n: value })}>
      <i />{value === 10 ? '⑩' : '⑤'}
    </span>)}</span>}
  </button>
    {onInspect
      ? <button type="button" className={`${styles.deckCount} ${styles.deckContentsButton}`} onClick={onInspect}
        aria-label={t('{owner}の{zone}の中身を見る（{n}枚）', { owner, zone: label, n: ids.length })} title={t('中身を見る')}>{ids.length}<small>{t('枚')}</small></button>
      : <span className={styles.deckCount}>{ids.length}<small>{t('枚')}</small></span>}
  </>;
}

export function Counter({ label, value, points, bonus = 0, temporaryBonus = 0, pp, adjusts, onAdjust, onReset, test, target, onClick }: {
  label: string; value: number; points?: boolean; bonus?: number; temporaryBonus?: number; pp?: string;
  /** What the − / ＋ buttons change, when it is not the points or the extra PP (edit mode: the turn count). */
  adjusts?: string;
  onAdjust: (delta: number) => void; onReset: () => void; test: boolean; target?: boolean; onClick?: () => void;
}) {
  const { t } = useI18n();
  // The callers' Japanese labels are translated here too (t() leaves text that is already English).
  const name = t(adjusts ?? (points ? 'お菓子ポイント' : '追加PP'));
  return <div className={`${styles.counter} ${target ? styles.counterTarget : ''}`}>
    <button className={styles.counterLabel} onClick={onClick} aria-label={`${t(label)} ${value}`}>
      {t(label)}
    </button>
    <div className={styles.counterValue}><span>{value}</span>{pp && <small>{pp} PP</small>}
      {!!bonus && <span className={styles.whiteMarble} role="img" aria-label={t('追加PP {n}', { n: bonus })}>{bonus > 0 ? '+' : ''}{bonus}</span>}
      {!!temporaryBonus && <span className={styles.whiteMarble} role="img" aria-label={t('このターンの追加PP {n}', { n: temporaryBonus })}>+{temporaryBonus}</span>}
    </div>
    <div className={styles.counterControls}>
      <button disabled={!test} onClick={() => onAdjust(-5)} aria-label={t('{name}を{n}減らす', { name, n: 5 })}>≪</button>
      <button disabled={!test} onClick={() => onAdjust(-1)} aria-label={t('{name}を{n}減らす', { name, n: 1 })}>＜</button>
      <button disabled={!test} onClick={onReset}>Reset</button>
      <button disabled={!test} onClick={() => onAdjust(1)} aria-label={t('{name}を{n}増やす', { name, n: 1 })}>＞</button>
      <button disabled={!test} onClick={() => onAdjust(5)} aria-label={t('{name}を{n}増やす', { name, n: 5 })}>≫</button>
    </div>
  </div>;
}

export function PpPanel({ side, name, portrait, order, current, maximum, own, children }: { side: number; name: string; portrait?: AvatarIdentity; order?: 'first' | 'second'; current: number; maximum: number; own: boolean; children?: ReactNode }) {
  const { t } = useI18n();
  return <div data-pp={side} className={`${styles.ppPanel} ${own ? styles.ownPp : ''}`} role="group" aria-label={t(own ? '自分のPP {current} / {max}' : '相手のPP {current} / {max}', { current, max: maximum })}>
    <div className={styles.ppPlayerName} title={name}>
      {portrait && <Avatar {...portrait} size={24} />}
      <div className={styles.ppNameText}>{name}</div>
      {order && <small className={styles.ppOrder} data-order={order}>{t(order === 'first' ? '先攻' : '後攻')}</small>}
    </div>
    <div className={styles.ppAmount} aria-hidden="true"><span>PP</span><b>{current}</b><em>/{maximum}</em></div>
    {own && maximum > 0 && <div className={styles.ppGems} style={{ '--pp-count': maximum } as CSSProperties} aria-hidden="true">
      {Array.from({ length: maximum }, (_, index) => <i key={index} className={index < current ? styles.availablePp : styles.spentPp} />)}
    </div>}
    {children}
  </div>;
}

type Rect = { x: number; y: number; width: number; height: number };
/** A card travelling between two places on the table (drawn, discarded, destroyed, stolen …). */
export interface DrawFlight {
  id: number;
  uid: string; cardId: string; from: Rect; to: Rect;
  /** down: back all the way; up: face all the way; reveal: back → face; hide: face → back. */
  look: 'down' | 'up' | 'reveal' | 'hide';
  /** Rotation at each end in degrees (the far side's field and piles lie upside down). */
  spin: [number, number];
  /** Waits this long (ms) before leaving, e.g. a destroyed unit waits for its damage number. */
  delay: number;
  /** Where it lands, or null when it leaves the game. */
  toZone: Zone | null;
  /** 山札から手札へのドローだけは、移動中も次の1枚を引ける。 */
  fromZone: Zone;
}
const looks = { down: styles.lookDown, up: styles.lookUp, reveal: styles.lookReveal, hide: styles.lookHide } as const;
export function FlyingCard({ flight }: { flight: DrawFlight }) {
  const { from, to, look, spin, delay, cardId } = flight;
  const css = {
    left: from.x, top: from.y, width: from.width, height: from.height,
    '--fly-x': `${to.x - from.x}px`, '--fly-y': `${to.y - from.y}px`,
    '--fly-scale-x': to.width / from.width, '--fly-scale-y': to.height / from.height,
    '--spin-start': `${spin[0]}deg`, '--spin-end': `${spin[1]}deg`, '--fly-delay': `${delay}ms`,
  } as React.CSSProperties;
  return <div className={styles.flyingCard} data-draw-flight style={css} aria-hidden="true">
    <div className={styles.flightSpin}><div className={looks[look]}>
      <span className={styles.flightBack} />
      {look !== 'down' && <span className={styles.flightFront}><GameCard id={cardId} sizes={HAND_CARD_SIZES} /></span>}
    </div></div>
  </div>;
}
