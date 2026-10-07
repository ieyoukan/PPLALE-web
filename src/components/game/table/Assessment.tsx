'use client';

// The course of the match (形勢), like a shogi app: a bar with the current chance of winning during
// the match, and on the result screen the whole curve with the moves that lost the most.
import type { Side } from '@pplale/game-core';
import { useBoardContext } from '../board/BoardContext';
import type { AssessedPoint } from '../board/assess';
import styles from './Assessment.module.css';

const percent = (win: number, side: Side) => Math.round((side === 0 ? win : 1 - win) * 100);
const turnName = ({ order, number }: AssessedPoint['turn']) => `${order === 'first' ? '先攻' : '後攻'}${number}ターン目`;

/** The current chance of winning of the side at the bottom of the screen. */
export function AssessmentBar() {
  const { assessment, showAssessment, assessable, view, names, game } = useBoardContext();
  const last = assessment.at(-1);
  if (!assessable || !showAssessment || !last || game.winner !== null) return null;
  const mine = percent(last.win, view);
  // Like a shogi app's bar: the far side on top, the near side filling from the bottom.
  return <div className={styles.bar} role="status" aria-label={`形勢 ${names[view]} ${mine}%`}>
    <span className={styles.name}>{100 - mine}%</span>
    <span className={styles.track}><span className={styles.near} style={{ height: `${mine}%` }} /></span>
    <span className={styles.name}><b>{mine}%</b></span>
  </div>;
}

/** The whole match as a curve of `side`'s chance, and the moves of `side` that lost the most. */
export function AssessmentGraph({ side }: { side: Side }) {
  const { assessment, names } = useBoardContext();
  if (assessment.length < 2) return null;
  const width = 600, height = 160, first = assessment[0].index, last = assessment.at(-1)!.index;
  const x = (index: number) => (index - first) / Math.max(1, last - first) * width;
  const y = (win: number) => (1 - percent(win, side) / 100) * height;
  const line = assessment.map(p => `${x(p.index).toFixed(1)},${y(p.win).toFixed(1)}`).join(' ');
  // A tick where each turn begins.
  const turns = assessment.filter((p, i) => i === 0 || p.turn.number !== assessment[i - 1].turn.number || p.turn.order !== assessment[i - 1].turn.order);
  const mistakes = assessment.filter(p => p.grade && p.command?.actor === side).sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0)).slice(0, 3);
  return <section className={styles.graph} aria-label={`${names[side]}の形勢の推移`}>
    <h3>形勢の推移 <small>{names[side]}の勝ちやすさ</small></h3>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`最後は${percent(assessment.at(-1)!.win, side)}%`}>
      <rect x="0" y="0" width={width} height={height / 2} className={styles.ahead} />
      {turns.map(p => <line key={p.index} x1={x(p.index)} x2={x(p.index)} y1="0" y2={height} className={p.turn.order === 'first' ? styles.tickFirst : styles.tickSecond} />)}
      <line x1="0" x2={width} y1={height / 2} y2={height / 2} className={styles.even} />
      <polyline points={line} className={styles.curve} vectorEffect="non-scaling-stroke" />
      {mistakes.map(p => <circle key={p.index} cx={x(p.index)} cy={y(p.win)} r="6" className={p.grade === 'blunder' ? styles.blunder : styles.dubious} vectorEffect="non-scaling-stroke" />)}
    </svg>
    {mistakes.length > 0 && <ul className={styles.mistakes}>{mistakes.map(p => <li key={p.index}>
      <span className={p.grade === 'blunder' ? styles.blunderTag : styles.dubiousTag}>{p.grade === 'blunder' ? '悪手' : '疑問手'}</span>
      {turnName(p.turn)}　{p.label}　<small>−{Math.round((p.loss ?? 0) * 100)}%</small>
    </li>)}</ul>}
  </section>;
}
