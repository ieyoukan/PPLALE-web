'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { lethalPuzzles } from '@/lib/game/puzzles';
import { puzzleHref } from '@/lib/game/sessionStore';
import { useBoardContext } from '../board/BoardContext';
import { PuzzleIcon } from './PuzzleIcon';
import styles from './Puzzles.module.css';

export function PuzzleControls() {
  const { puzzle, busy, canUndo, undo, rematch, leave } = useBoardContext();
  if (!puzzle) return null;
  return <>
    <div className={styles.tools} role="toolbar" aria-label="リーサルパズル">
      <div className={styles.toolHeading}>
        <b>{puzzle.problem.title}</b>
        <button className={styles.backToList} aria-label="問題一覧へ" onClick={leave}>一覧</button>
      </div>
      <small className={styles.goal}>このターンで勝利</small>
      <div className={styles.toolActions}>
        <button aria-label="一手戻す" disabled={!canUndo || busy} onClick={undo}><PuzzleIcon name="undo" />戻す</button>
        <button aria-label="最初からやり直す" disabled={busy} onClick={rematch}><PuzzleIcon name="reset" />やり直す</button>
      </div>
    </div>
    {puzzle.status !== 'playing' && !busy && <PuzzleResult />}
  </>;
}

function PuzzleResult() {
  const { puzzle, canUndo, undo, rematch, leave, session } = useBoardContext();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>('[data-primary-action]')?.focus(); }, []);
  if (!puzzle) return null;
  const won = puzzle.status === 'cleared';
  const next = lethalPuzzles[lethalPuzzles.findIndex(problem => problem.id === puzzle.problem.id) + 1];
  return <div className={styles.resultBackdrop}>
    <section ref={dialog} className={styles.result} role="dialog" aria-modal="true" data-result-screen aria-label={won ? 'パズルクリア' : 'もう一度挑戦'} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, a') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <span className={`${styles.resultMark} ${won ? styles.success : ''}`}><PuzzleIcon name={won ? 'check' : 'undo'} /></span>
      <h2>{won ? 'クリア！' : 'もう一度！'}</h2>
      <p>{puzzle.problem.title}</p>
      {session.saveError && <p className={styles.note} role="status">{session.saveError}</p>}
      <div className={styles.resultActions}>
        {won
          ? next
            ? <Link data-primary-action className={styles.primaryResult} href={puzzleHref(next.id)} prefetch={false}>次の問題へ <PuzzleIcon name="arrow" /></Link>
            : <button data-primary-action className={styles.primaryResult} onClick={leave}>問題一覧へ <PuzzleIcon name="arrow" /></button>
          : canUndo
            ? <button data-primary-action className={styles.primaryResult} onClick={undo}><PuzzleIcon name="undo" /> 一手戻す</button>
            : <button data-primary-action className={styles.primaryResult} onClick={rematch}><PuzzleIcon name="reset" /> 最初から</button>}
        {(won || canUndo) && <button onClick={rematch}>最初から</button>}
        {(!won || next) && <button onClick={leave}>問題一覧へ</button>}
      </div>
    </section>
  </div>;
}
