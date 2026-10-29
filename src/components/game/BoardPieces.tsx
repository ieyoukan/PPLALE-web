'use client';

import type { Side, Zone } from '@pplale/game-core';
import type { CSSProperties } from 'react';
import { HAND_CARD_SIZES } from '@/lib/game/cardImages';
import { GameCard } from './GameCard';
import { Avatar } from '@/components/shared/player/Avatar';
import type { AvatarIdentity } from '@/components/shared/player/Avatar';
import styles from './BoardEmulator.module.css';
import cue from './DrawCue.module.css';

export type ZoneKind = 'yojo' | 'sweet' | 'nap' | 'exile';
export function DeckStack({ side, kind, ids, thresholds = [], enabled, drawing = false, thresholdDraw = false, onClick, onInspect }: {
  side: Side; kind: ZoneKind; ids: string[]; thresholds?: number[];
  enabled: boolean; drawing?: boolean; thresholdDraw?: boolean; onClick: () => void; onInspect?: () => void;
}) {
  const labelWords = { yojo: ['幼女', 'デッキ'], sweet: ['お菓子', 'デッキ'], nap: ['お昼寝', '場所'], exile: ['除外', 'ゾーン'] }[kind];
  const label = labelWords.join('');
  const helpId = `threshold-draw-${side}`;
  return <><button type="button" data-deck={`${side}-${kind}`} data-threshold-draw={thresholdDraw || undefined} data-label={{ yojo: '幼女', sweet: 'お菓子', nap: 'お昼寝', exile: '除外' }[kind]} className={`${styles.deckZone} ${drawing ? styles.drawReady : ''} ${thresholdDraw ? cue.required : ''}`}
    onClick={onClick} disabled={!enabled} aria-label={`${side === 0 ? 'あなた' : '相手'}の${label} ${ids.length}枚`} aria-describedby={thresholdDraw ? helpId : undefined}>
    {thresholdDraw && <span className={cue.guide} data-draw-cue>
      <span className={cue.label} id={helpId}>お菓子を1枚引く</span>
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
      role="img" aria-label={`${value}ポイントのドロー${thresholds.includes(value) ? '機会使用済み' : '未達'}`}>
      <i />{value === 10 ? '⑩' : '⑤'}
    </span>)}</span>}
  </button>
    {onInspect
      ? <button type="button" className={`${styles.deckCount} ${styles.deckContentsButton}`} onClick={onInspect}
        aria-label={`${side === 0 ? 'あなた' : '相手'}の${label}の中身を見る（${ids.length}枚）`} title="中身を見る">{ids.length}<small>枚</small></button>
      : <span className={styles.deckCount}>{ids.length}<small>枚</small></span>}
  </>;
}

export function Counter({ label, value, points, bonus = 0, temporaryBonus = 0, pp, adjusts, onAdjust, onReset, test, target, onClick }: {
  label: string; value: number; points?: boolean; bonus?: number; temporaryBonus?: number; pp?: string;
  /** What the − / ＋ buttons change, when it is not the points or the extra PP (edit mode: the turn count). */
  adjusts?: string;
  onAdjust: (delta: number) => void; onReset: () => void; test: boolean; target?: boolean; onClick?: () => void;
}) {
  const name = adjusts ?? (points ? 'お菓子ポイント' : '追加PP');
  return <div className={`${styles.counter} ${target ? styles.counterTarget : ''}`}>
    <button className={styles.counterLabel} onClick={onClick} aria-label={`${label} ${value}`}>
      {label}
    </button>
    <div className={styles.counterValue}><span>{value}</span>{pp && <small>{pp} PP</small>}
      {!!bonus && <span className={styles.whiteMarble} role="img" aria-label={`追加PP ${bonus}`}>{bonus > 0 ? '+' : ''}{bonus}</span>}
      {!!temporaryBonus && <span className={styles.whiteMarble} role="img" aria-label={`このターンの追加PP ${temporaryBonus}`}>+{temporaryBonus}</span>}
    </div>
    <div className={styles.counterControls}>
      <button disabled={!test} onClick={() => onAdjust(-5)} aria-label={`${name}を5減らす`}>≪</button>
      <button disabled={!test} onClick={() => onAdjust(-1)} aria-label={`${name}を1減らす`}>＜</button>
      <button disabled={!test} onClick={onReset}>Reset</button>
      <button disabled={!test} onClick={() => onAdjust(1)} aria-label={`${name}を1増やす`}>＞</button>
      <button disabled={!test} onClick={() => onAdjust(5)} aria-label={`${name}を5増やす`}>≫</button>
    </div>
  </div>;
}

export function PpPanel({ side, name, portrait, order, current, maximum, own }: { side: number; name: string; portrait?: AvatarIdentity; order?: 'first' | 'second'; current: number; maximum: number; own: boolean }) {
  return <div data-pp={side} className={`${styles.ppPanel} ${own ? styles.ownPp : ''}`} role="group" aria-label={`${own ? '自分' : '相手'}のPP ${current} / ${maximum}`}>
    <div className={styles.ppPlayerName} title={name}>
      {portrait && <Avatar {...portrait} size={24} />}
      <div className={styles.ppNameText}>{name}</div>
      {order && <small className={styles.ppOrder} data-order={order}>{order === 'first' ? '先攻' : '後攻'}</small>}
    </div>
    <div className={styles.ppAmount} aria-hidden="true"><span>PP</span><b>{current}</b><em>/{maximum}</em></div>
    {own && maximum > 0 && <div className={styles.ppGems} style={{ '--pp-count': maximum } as CSSProperties} aria-hidden="true">
      {Array.from({ length: maximum }, (_, index) => <i key={index} className={index < current ? styles.availablePp : styles.spentPp} />)}
    </div>}
  </div>;
}

type Rect = { x: number; y: number; width: number; height: number };
/** A card travelling between two places on the table (drawn, discarded, destroyed, stolen …). */
export interface DrawFlight {
  uid: string; cardId: string; from: Rect; to: Rect;
  /** down: back all the way; up: face all the way; reveal: back → face; hide: face → back. */
  look: 'down' | 'up' | 'reveal' | 'hide';
  /** Rotation at each end in degrees (the far side's field and piles lie upside down). */
  spin: [number, number];
  /** Waits this long (ms) before leaving, e.g. a destroyed unit waits for its damage number. */
  delay: number;
  /** Where it lands, or null when it leaves the game. */
  toZone: Zone | null;
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
