import type { ReplayFrame } from '@pplale/game-core/history';
import type { Side } from '@pplale/game-core';
import styles from './History.module.css';

/** Playback reads saved estimates; it never runs today's model on an older match. */
export function RecordedAssessment({ frames, index, view, names, onSeek }: { frames: ReplayFrame[]; index: number; view: Side; names: [string, string]; onSeek?: (index: number) => void }) {
  const points = frames.flatMap((frame, at) => frame.presentation.assessment ? [{ at, win: frame.presentation.assessment.win }] : []);
  if (!points.length) return null;
  const percent = (win: number) => Math.round((view === 0 ? win : 1 - win) * 100);
  const x = (at: number) => at / Math.max(1, frames.length - 1) * 600;
  const line = points.map(point => `${x(point.at).toFixed(1)},${(100 - percent(point.win)).toFixed(1)}`).join(' ');
  const current = frames[index].presentation.assessment;
  return <section className={styles.recordedAssessment} aria-label="形勢の推移" title="記録時の局面評価">
    <div><span>形勢</span>{current && <><b>{names[view]} {percent(current.win)}%</b><span>{names[(1 - view) as Side]} {100 - percent(current.win)}%</span></>}</div>
    <svg viewBox="0 0 600 100" preserveAspectRatio="none" role="img" aria-label="保存された形勢と現在の再生位置">
      <line x1="0" x2="600" y1="50" y2="50" className={styles.assessmentEven} />
      <polyline points={line} className={styles.assessmentCurve} vectorEffect="non-scaling-stroke" />
      <line x1={x(index)} x2={x(index)} y1="0" y2="100" className={styles.assessmentCursor} vectorEffect="non-scaling-stroke" />
    </svg>
    {onSeek && <div className={styles.assessmentSeek} aria-label="形勢グラフから移動">{points.filter((_, at) => at % Math.max(1, Math.ceil(points.length / 12)) === 0).map(point => <button key={point.at} onClick={() => onSeek(point.at)} aria-label={`${point.at}手目の形勢へ移動`}>{point.at}</button>)}</div>}
  </section>;
}
