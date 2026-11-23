'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { lethalPuzzles, puzzleDifficulties, puzzleFruits } from '@/lib/game/puzzles';
import { lockedPuzzleFruits, useLockedPreview, useUnlockedPuzzles } from '@/lib/game/lockedPuzzles';
import type { LethalPuzzle } from '@/lib/game/puzzles';
import { usePuzzleProgress } from '@/lib/game/usePuzzleProgress';
import { puzzleHref, puzzleListHref } from '@/lib/game/sessionStore';
import { useI18n } from '@/i18n/LocaleProvider';
import { ScreenSubtitle } from '@/components/shared/ui/ScreenSubtitle';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { PUZZLE_TAGLINE } from './copy';
import previews from '@/data/lethalPuzzlePreviews.json';
import { PuzzleIcon } from './PuzzleIcon';
import { PuzzleLock } from './PuzzleLock';
import styles from './Puzzles.module.css';

const FRUIT_KEY = 'pplale-puzzle-fruit-v1';
const fruitOptions = [...puzzleFruits, ...lockedPuzzleFruits];

export default function PuzzleLobby({ fruitId }: { fruitId?: string } = {}) {
  const progress = usePuzzleProgress();
  const { t } = useI18n();
  const unlocked = useUnlockedPuzzles();
  const puzzles = [...lethalPuzzles, ...unlocked.puzzles];
  const cleared = puzzles.filter(puzzle => progress.cleared.includes(puzzle.id)).map(puzzle => puzzle.id);
  const queryFruit = useSearchParams().get('fruit');
  const [savedFruit, setSavedFruit] = useState('');
  const requested = fruitId ?? queryFruit;
  const fruit = fruitOptions.find(option => option.id === (requested ?? savedFruit)) ?? fruitOptions[0];
  const isLocked = (id: string) => lockedPuzzleFruits.some(option => option.id === id) && !puzzles.some(puzzle => puzzle.fruit === id);
  const lock = unlocked.ready && isLocked(fruit.id) ? lockedPuzzleFruits.find(option => option.id === fruit.id) : undefined;
  useEffect(() => {
    try {
      if (requested) localStorage.setItem(FRUIT_KEY, fruit.id);
      else setSavedFruit(localStorage.getItem(FRUIT_KEY) ?? '');
    } catch { /* Selection still works for this visit without storage. */ }
  }, [requested, fruit.id]);
  return <div className={styles.lobby}>
    <ScreenSubtitle>{t(PUZZLE_TAGLINE)}</ScreenSubtitle>
    <div className={styles.intro}>
      <nav className={styles.fruitPicker} aria-label={t('パズルのフルーツ')}>
        {fruitOptions.map(option => <Link key={option.id} href={puzzleListHref(option.id)} scroll={false} prefetch={false} aria-current={fruit.id === option.id ? 'page' : undefined} data-ui-title>{unlocked.ready && isLocked(option.id) && <PuzzleIcon name="lock" />}{t(option.label)}</Link>)}
      </nav>
      <div className={styles.progress}>
        <progress max={puzzles.length} value={cleared.length} aria-label={t('パズルのクリア状況')} />
        <span role="img" aria-label={t('{total}問中{cleared}問クリア', { total: puzzles.length, cleared: cleared.length })}>{cleared.length} / {puzzles.length}</span>
      </div>
    </div>
    {lock && <PuzzleLock key={lock.id} fruit={lock.id} label={lock.label} count={lock.count} />}
    {puzzleDifficulties.filter(difficulty => puzzles.some(puzzle => puzzle.fruit === fruit.id && puzzle.difficulty === difficulty)).map(difficulty => <section key={difficulty}>
      <h2 data-ui-title>{fruit.id === 'intro' ? t('入門編') : `${t(fruit.label)} ${t(difficulty)}`}</h2>
      <ul className={styles.grid}>{puzzles.filter(puzzle => puzzle.fruit === fruit.id && puzzle.difficulty === difficulty).map(puzzle => {
        const done = cleared.includes(puzzle.id);
        const preview = previews.puzzles[puzzle.id as keyof typeof previews.puzzles] as typeof previews.puzzles[keyof typeof previews.puzzles] | undefined;
        return <li key={puzzle.id}>
          <OrnateFrame as={Link} size="sm" className={styles.problem} href={puzzleHref(puzzle.id)} prefetch={false} aria-label={t(puzzle.title) + (done ? t(' クリア済み') : '')}>
            <span className={styles.preview} data-puzzle-preview={puzzle.id}>
              {preview
                ? <Image src={preview.src} alt={t('{title}の出題盤面', { title: t(puzzle.title) })} width={preview.width} height={preview.height} sizes="(max-width: 900px) 70vw, 460px" unoptimized />
                : <LockedPreview puzzle={puzzle} />}
              <span className={styles.previewPlay}><PuzzleIcon name="play" /></span>
              {done && <span className={styles.cleared}><PuzzleIcon name="check" /></span>}
            </span>
            <div className={styles.problemFooter}>
              <b data-ui-title>{t(puzzle.title)}</b>
              <span className={styles.start}><PuzzleIcon name="arrow" /></span>
            </div>
          </OrnateFrame>
        </li>;
      })}</ul>
    </section>)}
  </div>;
}

/** 限定公開の問題の盤面は暗号化して配信し、解錠した端末で復号してから見せる。 */
function LockedPreview({ puzzle }: { puzzle: LethalPuzzle }) {
  const { t } = useI18n();
  const src = useLockedPreview(puzzle);
  return src
    ? <Image className={styles.revealed} src={src} alt={t('{title}の出題盤面', { title: t(puzzle.title) })} width={1280} height={720} unoptimized />
    : <span className={styles.placeholderPreview}><PuzzleIcon name="fruit" /></span>;
}
