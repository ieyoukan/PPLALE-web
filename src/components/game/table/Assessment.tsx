'use client';

// The course of the match (形勢), like a shogi app: a bar with the current chance of winning during the match,
// on the result screen the whole curve, and in 形勢の詳細 the match turn by turn: how far each turn and each move
// moved the chance, the blunders and the big rises and falls marked, and a way back into the replay just before any move.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Side } from '@pplale/game-core';
import { useI18n } from '@/i18n/LocaleProvider';
import { turnName as nameTurn } from '@/lib/game/sessionStore';
import type { Translate } from '@/lib/game/sessionStore';
import { useBoardContext } from '../board/BoardContext';
import type { AssessedPoint } from '../board/assess';
import { moveText } from '../board/assess';
import { TURNAROUND } from '../board/assessmentHighlights';
import styles from './Assessment.module.css';

const percent = (win: number, side: Side) => Math.round((side === 0 ? win : 1 - win) * 100);
const turnName = ({ order, number }: AssessedPoint['turn'], t: Translate) => nameTurn(order, number, t);
/** A change of the chance, as whole points with its sign (−15, +12). */
const signed = (delta: number) => `${delta >= 0 ? '+' : '−'}${Math.abs(Math.round(delta * 100))}`;

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

/**
 * blunder / dubious: this side's move, graded against the best move (after the match). up / down: any move (either
 * side's, a draw, a die) that moved this side's chance by 12 points or more, as the replay's timeline marks them.
 */
type Mark = 'blunder' | 'dubious' | 'up' | 'down';
const markName: Record<Mark, string> = { blunder: '悪手', dubious: '疑問手', up: '好転', down: '悪化' };
interface Move { point: AssessedPoint; actor: Side; mark: Mark | null; /** For `side`; null across a gap in an unfinished analysis. */ delta: number | null }
interface TurnCourse { key: string; turn: AssessedPoint['turn']; owner: Side; moves: Move[]; /** Positions (command counts) where it starts and ends. */ from: number; to: number; delta: number }

/** The match turn by turn, as `side` sees it. */
function courseOf(points: AssessedPoint[], side: Side): TurnCourse[] {
  const mine = (point: AssessedPoint) => side === 0 ? point.win : 1 - point.win;
  const turns: TurnCourse[] = [];
  points.forEach((point, index) => {
    const before = points[index - 1];
    if (!before || !point.command) return;
    const turn = point.playedIn ?? point.turn, key = `${turn.order}${turn.number}`;
    let course = turns.at(-1);
    if (course?.key !== key) {
      course = { key, turn, owner: point.command.actor, moves: [], from: before.index, to: point.index, delta: 0 };
      turns.push(course);
    }
    const delta = point.index === before.index + 1 ? mine(point) - mine(before) : null;
    const own = point.command.actor === side;
    const swing = delta === null ? null : delta >= TURNAROUND - 1e-9 ? 'up' : delta <= -TURNAROUND + 1e-9 ? 'down' : null;
    course.moves.push({ point, actor: point.command.actor, delta, mark: (own && point.grade) || swing });
    course.to = point.index;
  });
  for (const course of turns) {
    // The turn's player is who acted most in it (the other only answers choices).
    const acts = course.moves.filter(move => move.actor === 0).length;
    course.owner = acts * 2 >= course.moves.length ? 0 : 1;
    const start = points.find(point => point.index === course.from), end = points.find(point => point.index === course.to);
    course.delta = start && end ? mine(end) - mine(start) : 0;
  }
  return turns;
}

/**
 * The curve of `side`'s chance over the whole match on a dark face: green above even, pink below, a band for
 * each turn (this side's lighter) numbered below, and the marked moves. Shapes are drawn in the SVG, which
 * stretches; marks and words lie over it in HTML, so they keep their shape at any width.
 */
function CourseChart({ points, side, turns, selected, onSelect, compact }: {
  points: AssessedPoint[]; side: Side; turns: TurnCourse[]; selected?: number | null; onSelect?: (index: number) => void; compact?: boolean;
}) {
  const { t, gameText } = useI18n();
  const { names } = useBoardContext();
  // Pointed at (hovered, or touched): the move nearest the pointer, told above the curve.
  const [pointed, setPointed] = useState<Move | null>(null);
  const moves = useMemo(() => turns.flatMap(course => course.moves), [turns]);
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = points[0].index + (event.clientX - box.left) / box.width * (points.at(-1)!.index - points[0].index);
    let nearest: Move | null = null;
    for (const move of moves) if (!nearest || Math.abs(move.point.index - at) < Math.abs(nearest.point.index - at)) nearest = move;
    setPointed(nearest);
  };
  const first = points[0].index, last = points.at(-1)!.index, span = Math.max(1, last - first);
  const x = (index: number) => (index - first) / span * 100;
  const y = (win: number) => (1 - (side === 0 ? win : 1 - win)) * 100;
  const line = points.map(p => `${x(p.index).toFixed(2)},${y(p.win).toFixed(2)}`).join(' ');
  const area = `${x(first)},50 ${line} ${x(last)},50`;
  const marks = moves.filter(move => move.mark);
  const chosen = selected === null || selected === undefined ? undefined : points.find(point => point.index === selected);
  const label = (step: number) => step % Math.max(1, Math.ceil(turns.length / 14)) === 0;
  return <div className={`${styles.chart} ${compact ? styles.chartCompact : ''}`}
    onPointerMove={compact ? undefined : point} onPointerDown={compact ? undefined : point} onPointerLeave={() => setPointed(null)}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t('最後は{percent}%', { percent: percent(points.at(-1)!.win, side) })}>
      <defs>
        <clipPath id={`ahead-${side}`}><rect x="0" y="0" width="100" height="50" /></clipPath>
        <clipPath id={`behind-${side}`}><rect x="0" y="50" width="100" height="50" /></clipPath>
      </defs>
      {turns.map(course => <rect key={course.key} x={x(course.from)} width={Math.max(0, x(course.to) - x(course.from))} y="0" height="100" className={course.owner === side ? styles.bandMine : styles.bandTheirs} />)}
      <polygon points={area} className={styles.areaAhead} clipPath={`url(#ahead-${side})`} />
      <polygon points={area} className={styles.areaBehind} clipPath={`url(#behind-${side})`} />
      <line x1="0" x2="100" y1="50" y2="50" className={styles.even} vectorEffect="non-scaling-stroke" />
      <polyline points={line} className={styles.curve} vectorEffect="non-scaling-stroke" />
    </svg>
    <span className={styles.axis} style={{ top: 0 }} aria-hidden="true">100</span>
    <span className={styles.axis} style={{ top: '50%' }} aria-hidden="true">50</span>
    <span className={styles.axis} style={{ top: '100%' }} aria-hidden="true">0</span>
    {!compact && turns.map((course, step) => label(step) && <span key={course.key} aria-hidden="true" className={styles.turnNumber} data-mine={course.owner === side || undefined}
      style={{ left: `${(x(course.from) + x(course.to)) / 2}%` }}>{course.turn.number}</span>)}
    {chosen && <span className={styles.cursor} style={{ left: `${x(chosen.index)}%` }} aria-hidden="true" />}
    {pointed && <>
      <span className={styles.cursor} data-pointed style={{ left: `${x(pointed.point.index)}%` }} aria-hidden="true" />
      <span className={styles.pointed} style={{ left: `${Math.min(84, Math.max(16, x(pointed.point.index)))}%` }} role="status">
        <small>{turnName(pointed.point.playedIn ?? pointed.point.turn, t)}・{t(names[pointed.actor])}</small>
        <span>{pointed.mark && <i data-mark={pointed.mark} aria-hidden="true" />}{moveText(pointed.point.label ?? '', t, gameText)}</span>
        {pointed.delta !== null && <b data-sign={Math.sign(Math.round(pointed.delta * 100))}>{signed(pointed.delta)}%</b>}
      </span>
    </>}
    {marks.map(({ point, mark }) => {
      const style = { left: `${x(point.index)}%`, top: `${y(point.win)}%` } as CSSProperties;
      const name = t(markName[mark!]);
      return onSelect
        ? <button key={point.index} type="button" className={styles.mark} data-mark={mark} data-selected={point.index === selected || undefined} style={style}
          aria-label={`${name} ${turnName(point.playedIn ?? point.turn, t)} ${moveText(point.label ?? '', t, gameText)}`} onClick={() => onSelect(point.index)} />
        : <span key={point.index} className={styles.mark} data-mark={mark} style={style} aria-hidden="true" />;
    })}
  </div>;
}

/** The whole match as a curve of `side`'s chance, with that side's notable moves. */
export function AssessmentGraph({ side, compact = false }: { side: Side; compact?: boolean }) {
  const { assessment, names, remote } = useBoardContext();
  const { t } = useI18n();
  const turns = useMemo(() => courseOf(assessment, side), [assessment, side]);
  if (assessment.length < 2) return null;
  if (!compact) return <AssessmentDetail side={side} />;
  return <section className={`${styles.graph} ${styles.compact}`} aria-label={t('{name}の形勢の推移', { name: t(names[side]) })}>
    <h3>{t('形勢の推移')} <small>{remote && !remote.recorded ? t('公開盤面の目安') : t('{name}の勝ちやすさ', { name: t(names[side]) })}</small></h3>
    <CourseChart points={assessment} side={side} turns={turns} compact />
  </section>;
}

/**
 * 形勢の詳細: the counts of marked moves, the curve (its marks pick a move), then every turn with how far it
 * moved the chance. A turn opens to its moves, each with its change and mark, and a button that opens the
 * replay just before it. Turns with a marked move of this side start open.
 */
function AssessmentDetail({ side }: { side: Side }) {
  const { assessment, names, canReplay, replayFrom } = useBoardContext();
  const { t, gameText } = useI18n();
  const turns = useMemo(() => courseOf(assessment, side), [assessment, side]);
  const [selected, setSelected] = useState<number | null>(null);
  const [opened, setOpened] = useState<Set<string> | null>(null);
  const open = opened ?? new Set(turns.filter(course => course.moves.some(move => move.mark)).map(course => course.key));
  const toggle = (key: string) => setOpened(new Set(open.has(key) ? [...open].filter(other => other !== key) : [...open, key]));
  const marked = turns.flatMap(course => course.moves.filter(move => move.mark));
  const count = (mark: Mark) => marked.filter(move => move.mark === mark).length;
  // Choosing a mark on the curve opens its turn and brings its move into view.
  const select = (index: number) => {
    setSelected(index);
    const course = turns.find(item => item.moves.some(move => move.point.index === index));
    if (course && !open.has(course.key)) setOpened(new Set([...open, course.key]));
    requestAnimationFrame(() => document.getElementById(`move-${side}-${index}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const largest = Math.max(0.2, ...turns.map(course => Math.abs(course.delta)));
  return <section className={styles.detail} aria-label={t('{name}の形勢の推移', { name: t(names[side]) })}>
    <ul className={styles.counts} aria-label={t('印をつけた手')}>
      {(['up', 'down', 'dubious', 'blunder'] as const).map(mark => <li key={mark} data-mark={mark}><i aria-hidden="true" />{t(markName[mark])}<b>{count(mark)}</b></li>)}
    </ul>
    {/* Stays at the top of the sheet on tall screens, so a chosen move shows where it is on the curve. */}
    <div className={styles.chartHold}><CourseChart points={assessment} side={side} turns={turns} selected={selected} onSelect={select} /></div>
    <ol className={styles.turns}>
      {turns.map(course => {
        const isOpen = open.has(course.key), mine = course.owner === side;
        return <li key={course.key} className={styles.turn} data-mine={mine || undefined}>
          <button type="button" className={styles.turnHead} aria-expanded={isOpen} onClick={() => toggle(course.key)}
            aria-label={t('{turn} {name} {delta}', { turn: turnName(course.turn, t), name: t(names[course.owner]), delta: `${signed(course.delta)}%` })}>
            <span className={styles.turnBadge} aria-hidden="true">{course.turn.number}</span>
            <span className={styles.turnOwner} aria-hidden="true">{t(names[course.owner])}</span>
            <span className={styles.turnMarks} aria-hidden="true">{course.moves.filter(move => move.mark).map(move => <i key={move.point.index} data-mark={move.mark} />)}</span>
            <DeltaBar delta={course.delta} scale={largest} />
            <span className={styles.delta} data-sign={Math.sign(Math.round(course.delta * 100))} aria-hidden="true">{signed(course.delta)}</span>
            <span className={styles.chevron} aria-hidden="true" />
          </button>
          {isOpen && <ol className={styles.moves}>
            {course.moves.map(move => <li key={move.point.index} id={`move-${side}-${move.point.index}`} className={styles.move} data-mine={move.actor === side || undefined}
              data-selected={move.point.index === selected || undefined}
              // Pressed or focused (not hovered: the list scrolls under the pointer when a mark is chosen), it shows where it is on the curve.
              onClick={() => setSelected(move.point.index)} onFocus={() => setSelected(move.point.index)}>
              <span className={styles.actor} role="img" aria-label={t(names[move.actor])} />
              {move.mark && <span className={styles.tag} data-mark={move.mark}>{t(markName[move.mark])}</span>}
              <span className={styles.moveText}>{moveText(move.point.label ?? '', t, gameText)}</span>
              {move.delta === null ? <span className={styles.delta}>—</span>
                : <span className={styles.delta} data-sign={Math.sign(Math.round(move.delta * 100))}>{signed(move.delta)}</span>}
              {canReplay && <button type="button" className={styles.replay} onClick={() => replayFrom(move.point.index - 1)} aria-label={t('この手の前からリプレイで見る')}><i aria-hidden="true" /></button>}
            </li>)}
          </ol>}
        </li>;
      })}
    </ol>
    <p className={styles.note}>{t('直前の形勢との差（ドロー・ダイスの結果を含む）')}</p>
  </section>;
}

/** A change drawn from the middle: to the right in green when it helped, to the left in pink when it hurt. */
function DeltaBar({ delta, scale }: { delta: number; scale: number }) {
  const width = Math.min(50, Math.abs(delta) / scale * 50);
  return <span className={styles.deltaBar} aria-hidden="true">
    <i style={{ width: `${width}%`, [delta >= 0 ? 'left' : 'right']: '50%' } as CSSProperties} data-sign={delta >= 0 ? 1 : -1} />
  </span>;
}

