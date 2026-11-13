'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lethalPuzzles } from '@/lib/game/puzzles';
import { puzzleHref } from '@/lib/game/sessionStore';
import { MISSIONS_PATH, introProgress } from '@/lib/game/introCourse';
import { usePuzzleProgress } from '@/lib/game/usePuzzleProgress';
import { useI18n } from '@/i18n/LocaleProvider';
import { useBoardContext } from '../board/BoardContext';
import { PuzzleIcon } from './PuzzleIcon';
import { PuzzleLesson } from './PuzzleLesson';
import styles from './Puzzles.module.css';

export function PuzzleControls() {
  const { puzzle, busy, canUndo, undo, rematch, leave } = useBoardContext();
  const { t } = useI18n();
  if (!puzzle) return null;
  return <>
    <div className={styles.tools} role="toolbar" aria-label={t('リーサルパズル')}>
      <div className={styles.toolHeading}>
        <b>{t(puzzle.problem.title)}</b>
        <button className={styles.backToList} aria-label={t('問題一覧へ')} onClick={leave}>{t('一覧')}</button>
      </div>
      <small className={styles.goal}>{t('このターンで勝利')}</small>
      <div className={styles.toolActions}>
        <button aria-label={t('一手戻す')} disabled={!canUndo || busy} onClick={undo}><PuzzleIcon name="undo" />{t('戻す')}</button>
        <button aria-label={t('最初からやり直す')} disabled={busy} onClick={rematch}><PuzzleIcon name="reset" />{t('やり直す')}</button>
      </div>
      {puzzle.problem.lesson && <PuzzleLesson lesson={puzzle.problem.lesson} />}
    </div>
    {puzzle.status !== 'playing' && !busy && <PuzzleResult />}
  </>;
}

function PuzzleResult() {
  const router = useRouter();
  const { puzzle, canUndo, undo, rematch, leave, session } = useBoardContext();
  const { cleared } = usePuzzleProgress();
  const { t, gameText } = useI18n();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>('[data-primary-action]')?.focus(); }, []);
  if (!puzzle) return null;
  const won = puzzle.status === 'cleared';
  const following = lethalPuzzles[lethalPuzzles.findIndex(problem => problem.id === puzzle.problem.id) + 1];
  const introduction = puzzle.problem.fruit === 'intro';
  const next = introduction && following?.fruit !== 'intro' ? undefined : following;
  return <div className={styles.resultBackdrop}>
    <section ref={dialog} className={styles.result} role="dialog" aria-modal="true" data-result-screen aria-label={t(won ? 'パズルクリア' : 'もう一度挑戦')} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, a') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <span className={`${styles.resultMark} ${won ? styles.success : ''}`}><PuzzleIcon name={won ? 'check' : 'undo'} /></span>
      <h2>{t(won ? 'クリア！' : 'もう一度！')}</h2>
      <p>{t(puzzle.problem.title)}</p>
      {won && introduction && !next && <p>{t(introProgress([...cleared, puzzle.problem.id]).done ? '入門編クリア！初心者ミッション達成です。' : 'クリア！残りの入門問題にも挑戦しよう。')}</p>}
      {session.saveError && <p className={styles.note} role="status">{gameText(session.saveError)}</p>}
      <div className={styles.resultActions}>
        {won
          ? next
            ? <Link data-primary-action className={styles.primaryResult} href={puzzleHref(next.id)} prefetch={false}>{t('次の問題へ')} <PuzzleIcon name="arrow" /></Link>
            : introduction
              ? <button data-primary-action className={styles.primaryResult} onClick={() => router.push(MISSIONS_PATH)}>{t('初心者ミッションへ')} <PuzzleIcon name="arrow" /></button>
              : <button data-primary-action className={styles.primaryResult} onClick={leave}>{t('問題一覧へ')} <PuzzleIcon name="arrow" /></button>
          : canUndo
            ? <button data-primary-action className={styles.primaryResult} onClick={undo}><PuzzleIcon name="undo" /> {t('一手戻す')}</button>
            : <button data-primary-action className={styles.primaryResult} onClick={rematch}><PuzzleIcon name="reset" /> {t('最初から')}</button>}
        {(won || canUndo) && <button onClick={rematch}>{t('最初から')}</button>}
        {(!won || next) && <button onClick={leave}>{t('問題一覧へ')}</button>}
      </div>
    </section>
  </div>;
}
