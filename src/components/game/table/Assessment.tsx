'use client';

// The course of the match (形勢), like a shogi app: a bar with the current chance of winning during
// the match, and on the result screen the whole curve with improvements and costly moves.
import type { Side } from '@pplale/game-core';
import { useI18n } from '@/i18n/LocaleProvider';
import { turnName as nameTurn } from '@/lib/game/sessionStore';
import type { Translate } from '@/lib/game/sessionStore';
import { useBoardContext } from '../board/BoardContext';
import type { AssessedPoint } from '../board/assess';
import { moveText } from '../board/assess';
import { assessmentHighlights } from '../board/assessmentHighlights';
import styles from './Assessment.module.css';

const percent = (win: number, side: Side) => Math.round((side === 0 ? win : 1 - win) * 100);
const turnName = ({ order, number }: AssessedPoint['turn'], t: Translate) => nameTurn(order, number, t);

/** The current chance of winning of the side at the bottom of the screen. */
export function AssessmentBar() {
  const { assessment, showAssessment, assessable, view, names, game, remote } = useBoardContext();
  const { t } = useI18n();
  const last = assessment.at(-1);
  if (!assessable || !showAssessment || !last || game.winner !== null) return null;
  const mine = percent(last.win, view);
  // Like a shogi app's bar: the far side on top, the near side filling from the bottom.
  return <div className={styles.bar} role="status" aria-label={t('形勢 {name} {percent}%', { name: t(names[view]), percent: mine })} title={remote && !remote.recorded ? t('公開盤面の目安') : undefined}>
    <span className={styles.name}>{100 - mine}%</span>
    <span className={styles.track}><span className={styles.near} style={{ height: `${mine}%` }} /></span>
    <span className={styles.name}><b>{mine}%</b></span>
  </div>;
}

/** The whole match as a curve of `side`'s chance, with that side's notable moves. */
export function AssessmentGraph({ side, compact = false }: { side: Side; compact?: boolean }) {
  const { assessment, names, remote } = useBoardContext();
  const { t, gameText } = useI18n();
  if (assessment.length < 2) return null;
  const width = 600, height = 160, first = assessment[0].index, last = assessment.at(-1)!.index;
  // Leave room for markers even on the first/last move and at 0% or 100%.
  const padding = 10;
  const x = (index: number) => padding + (index - first) / Math.max(1, last - first) * (width - padding * 2);
  const y = (win: number) => padding + (1 - (side === 0 ? win : 1 - win)) * (height - padding * 2);
  const line = assessment.map(p => `${x(p.index).toFixed(1)},${y(p.win).toFixed(1)}`).join(' ');
  // A tick where each turn begins.
  const turns = assessment.filter((p, i) => i === 0 || p.turn.number !== assessment[i - 1].turn.number || p.turn.order !== assessment[i - 1].turn.order);
  const mistakes = assessment.filter(p => p.grade && p.command?.actor === side).sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0)).slice(0, 3);
  const highlights = assessmentHighlights(assessment, side);
  return <section className={`${styles.graph} ${compact ? styles.compact : ''}`} aria-label={t('{name}の形勢の推移', { name: t(names[side]) })}>
    <h3>{t('形勢の推移')} <small>{remote && !remote.recorded ? t('公開盤面の目安') : t('{name}の勝ちやすさ', { name: t(names[side]) })}</small></h3>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t('最後は{percent}%', { percent: percent(assessment.at(-1)!.win, side) })}>
      <rect x="0" y="0" width={width} height={height / 2} className={styles.ahead} />
      {turns.map(p => <line key={p.index} x1={x(p.index)} x2={x(p.index)} y1="0" y2={height} className={p.turn.order === 'first' ? styles.tickFirst : styles.tickSecond} />)}
      <line x1="0" x2={width} y1={height / 2} y2={height / 2} className={styles.even} />
      <polyline points={line} className={styles.curve} vectorEffect="non-scaling-stroke" />
      {highlights.map(({ point: p }) => <path key={p.index} d={`M${x(p.index)},${y(p.win) - 8}l7,8 -7,8 -7,-8Z`} className={styles.highlight} vectorEffect="non-scaling-stroke"><title>{t('{label}：形勢が好転', { label: moveText(p.label ?? '', t, gameText) })}</title></path>)}
      {mistakes.map(p => <circle key={p.index} cx={x(p.index)} cy={y(p.win)} r="6" className={p.grade === 'blunder' ? styles.blunder : styles.dubious} vectorEffect="non-scaling-stroke" />)}
    </svg>
    {!compact && highlights.length > 0 && <ul className={`${styles.mistakes} ${styles.highlights}`} aria-label={t('形勢が好転した手')}>{highlights.map(({ point: p, gain }) => <li key={p.index}>
      <span className={styles.highlightTag}><span aria-hidden="true">✦ </span>{t('好転')}</span>
      {turnName(p.playedIn ?? p.turn, t)}　{moveText(p.label ?? '', t, gameText)}　<small>＋{Math.round(gain * 100)}pt</small>
    </li>)}<li className={styles.note}>{t('直前の形勢との差（ドロー・ダイスの結果を含む）')}</li></ul>}
    {!compact && mistakes.length > 0 && <ul className={styles.mistakes}>{mistakes.map(p => <li key={p.index}>
      <span className={p.grade === 'blunder' ? styles.blunderTag : styles.dubiousTag}>{t(p.grade === 'blunder' ? '悪手' : '疑問手')}</span>
      {turnName(p.playedIn ?? p.turn, t)}　{moveText(p.label ?? '', t, gameText)}　<small>−{Math.round((p.loss ?? 0) * 100)}%</small>
    </li>)}</ul>}
  </section>;
}
