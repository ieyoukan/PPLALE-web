'use client';

// The replay as a video: a player that pops up from the bottom with play/pause, the turns, and the
// course of the match (形勢) as its timeline. Tapping the curve, or one of the marks where the match
// swung, moves the replay there at once.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '@/i18n/LocaleProvider';
import { useBoardContext } from '../board/BoardContext';
import { useReplayAssessment } from '../board/useReplayAssessment';
import { changeBetween, swingOf } from '../board/assessmentMarks';
import { stageRect, toStage } from '../stage/stageSpace';
import styles from './ReplayBar.module.css';

/** How long the player stays up while playing after the last touch. */
const HIDE_AFTER = 3500;
/**
 * The swings are found by the rule 形勢の詳細 uses (board/assessmentMarks.ts). Only how they fit on this thin timeline
 * is its own: of marks closer than 6% of its width the larger is kept, at most this many.
 */
const MAX_SWINGS = 6;

const icons = {
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M8 5.5v13M16 5.5v13',
  previous: 'M7 6v12M18 6l-8 6 8 6z',
  next: 'M17 6v12M6 6l8 6-8 6z',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  down: 'M6 9.5l6 6 6-6',
} as const;
function Icon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill={name === 'play' || name === 'previous' || name === 'next' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'pause' ? 3.2 : 2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={icons[name]} /></svg>;
}

export function ReplayBar() {
  const { timeline, seekReplay, paused, setPaused, stopReplay, names, view, showAssessment } = useBoardContext();
  const points = useReplayAssessment(timeline, showAssessment);
  const { t } = useI18n();
  const [shown, setShown] = useState(true);
  // Put away by its own button: it stays down (even paused) until its tab is pressed.
  const [away, setAway] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Up while paused; while playing it goes down after a while and comes back on any touch, like a video player.
  const wake = useCallback(() => {
    setShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), HIDE_AFTER);
  }, []);
  useEffect(() => {
    if (paused) { if (hideTimer.current) clearTimeout(hideTimer.current); setShown(true); return; }
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake);
    return () => { window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [paused, wake]);

  const length = timeline?.states.length ?? 0, at = timeline?.at ?? 0, last = Math.max(1, length - 1);
  /** Where each turn begins. */
  const turns = useMemo(() => {
    const states = timeline?.states ?? [];
    return states.flatMap((state, index) => index > 0 && state.phase === 'playing' && (state.turn !== states[index - 1].turn || states[index - 1].phase !== 'playing') ? [index] : []);
  }, [timeline?.states]);
  const near = (win: number) => view === 0 ? win : 1 - win;
  // The biggest swings: each is marked where the move that caused it was about to be played.
  const swings = useMemo(() => {
    const found = points.slice(1).flatMap((point, i) => {
      const change = changeBetween(points[i], point, view);
      return swingOf(change) ? [{ from: points[i].index, to: point.index, change: change! }] : [];
    });
    // The larger of two swings close together keeps its mark, so that marks never overlap.
    const kept: typeof found = [];
    for (const swing of found.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))) {
      if (kept.length < MAX_SWINGS && kept.every(other => Math.abs(other.from - swing.from) > last * 0.06)) kept.push(swing);
    }
    return kept.sort((a, b) => a.from - b.from);
  }, [points, view, last]);
  const x = (index: number) => index / last * 1000;
  const y = (win: number) => (1 - near(win)) * 100;
  const curve = points.length > 1 ? `M${points.map(point => `${x(point.index).toFixed(1)},${y(point.win).toFixed(1)}`).join('L')}` : '';

  const track = useRef<HTMLDivElement>(null), dragging = useRef(false);
  const seekAt = (event: ReactPointerEvent) => {
    const box = track.current && stageRect(track.current);
    if (!box || !timeline) return;
    const at = toStage(event.clientX, event.clientY);
    seekReplay(Math.round(Math.max(0, Math.min(1, (at.x - box.x) / box.width)) * last));
  };
  const turnStep = (direction: -1 | 1) => {
    const target = direction < 0 ? turns.filter(index => index < at).at(-1) ?? 0 : turns.find(index => index > at);
    if (target !== undefined) seekReplay(target);
  };
  // Space plays and pauses; the arrows move a position (with Shift, a turn).
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (event.code === 'Space') { event.preventDefault(); setPaused(!paused); }
      else if (timeline && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.shiftKey) turnStep(direction); else seekReplay(Math.max(0, Math.min(last, at + direction)));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const progress = `${x(at) / 10}%`;
  return <>
    <button className={styles.handle} data-shown={(shown && !away) || undefined} onClick={() => { setAway(false); wake(); }} aria-label={t('再生コントロールを表示')}><span /></button>
    <section className={styles.player} data-shown={(shown && !away) || undefined} inert={away || undefined} aria-label={t('リプレイの再生')} onPointerEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }} onPointerLeave={() => { if (!paused) wake(); }}>
      {timeline && <div ref={track} className={styles.track} role="slider" tabIndex={0} aria-label={t('再生位置')} aria-valuemin={0} aria-valuemax={last} aria-valuenow={at}
        aria-valuetext={t('{at} / {last}手', { at, last })}
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); seekAt(event); }}
        onPointerMove={event => { if (dragging.current) seekAt(event); }}
        onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
        <svg className={styles.course} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id="replay-played"><rect x="0" y="0" width={x(at)} height="100" /></clipPath></defs>
          {turns.map(index => <line key={index} x1={x(index)} x2={x(index)} y1="0" y2="100" className={styles.turn} vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2="1000" y1="50" y2="50" className={styles.even} vectorEffect="non-scaling-stroke" />
          {curve && <>
            <path d={`${curve}V100H${x(points[0].index)}Z`} className={styles.area} />
            <path d={`${curve}V100H${x(points[0].index)}Z`} className={styles.areaPlayed} clipPath="url(#replay-played)" />
            <path d={curve} className={styles.curve} vectorEffect="non-scaling-stroke" />
          </>}
        </svg>
        {!curve && <span className={styles.plain}><span style={{ width: progress }} /></span>}
        <span className={styles.head} style={{ left: progress }} />
        {swings.map(swing => <button key={swing.from} className={styles.swing} data-up={swing.change > 0 || undefined} style={{ left: `${x(swing.from) / 10}%` }}
          aria-label={t(swing.change > 0 ? '{name}の形勢が{percent}%良くなった場面へ' : '{name}の形勢が{percent}%悪くなった場面へ', { name: t(names[view]), percent: Math.round(Math.abs(swing.change) * 100) })}
          onPointerDown={event => event.stopPropagation()} onClick={() => seekReplay(swing.from)}>
          <span>{swing.change > 0 ? '+' : '−'}{Math.round(Math.abs(swing.change) * 100)}</span>
        </button>)}
      </div>}
      <div className={styles.controls}>
        <span className={styles.side}>
          {timeline && <output className={styles.count} aria-live="off">{at}<small> / {last}</small></output>}
        </span>
        <span className={styles.main}>
          {timeline && <button onClick={() => turnStep(-1)} disabled={at === 0} aria-label={t('前のターンへ')}><Icon name="previous" /></button>}
          <button className={styles.play} onClick={() => setPaused(!paused)} aria-label={t(paused ? '再生する' : '一時停止')}><Icon name={paused ? 'play' : 'pause'} /></button>
          {timeline && <button onClick={() => turnStep(1)} disabled={!turns.some(index => index > at)} aria-label={t('次のターンへ')}><Icon name="next" /></button>}
        </span>
        <span className={styles.side}>
          <button className={styles.stop} onClick={() => setAway(true)} aria-label={t('再生コントロールをしまう')}><Icon name="down" /></button>
          <button className={styles.stop} onClick={stopReplay} aria-label={t('リプレイをやめる')}><Icon name="close" /></button>
        </span>
      </div>
    </section>
  </>;
}
