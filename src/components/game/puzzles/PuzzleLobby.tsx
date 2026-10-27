'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { lethalPuzzles, puzzleDifficulties, puzzleFruits, readClearedPuzzles } from '@/lib/game/puzzles';
import { puzzleHref, puzzleListHref } from '@/lib/game/sessionStore';
import { ScreenSubtitle } from '@/components/shared/ui/ScreenSubtitle';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { PUZZLE_TAGLINE } from './copy';
import previews from '@/data/lethalPuzzlePreviews.json';
import { PuzzleIcon } from './PuzzleIcon';
import styles from './Puzzles.module.css';

const FRUIT_KEY = 'pplale-puzzle-fruit-v1';

export default function PuzzleLobby({ fruitId }: { fruitId?: string } = {}) {
  const [cleared, setCleared] = useState<string[]>([]);
  const queryFruit = useSearchParams().get('fruit');
  const [savedFruit, setSavedFruit] = useState('');
  const requested = fruitId ?? queryFruit;
  const fruit = puzzleFruits.find(option => option.id === (requested ?? savedFruit)) ?? puzzleFruits[0];
  useEffect(() => {
    try {
      if (requested) localStorage.setItem(FRUIT_KEY, fruit.id);
      else setSavedFruit(localStorage.getItem(FRUIT_KEY) ?? '');
    } catch { /* Selection still works for this visit without storage. */ }
  }, [requested, fruit.id]);
  useEffect(() => { setCleared(readClearedPuzzles()); }, []);
  return <div className={styles.lobby}>
    <ScreenSubtitle>{PUZZLE_TAGLINE}</ScreenSubtitle>
    <div className={styles.intro}>
      <nav className={styles.fruitPicker} aria-label="パズルのフルーツ">
        {puzzleFruits.map(option => <Link key={option.id} href={puzzleListHref(option.id)} scroll={false} prefetch={false} aria-current={fruit.id === option.id ? 'page' : undefined} data-ui-title>{option.label}</Link>)}
      </nav>
      <div className={styles.progress}>
        <progress max={lethalPuzzles.length} value={cleared.length} aria-label="パズルのクリア状況" />
        <span aria-label={`${lethalPuzzles.length}問中${cleared.length}問クリア`}>{cleared.length} / {lethalPuzzles.length}</span>
      </div>
    </div>
    {puzzleDifficulties.map(difficulty => <section key={difficulty}>
      <h2 data-ui-title>{fruit.label} {difficulty}</h2>
      <ul className={styles.grid}>{lethalPuzzles.filter(puzzle => puzzle.fruit === fruit.id && puzzle.difficulty === difficulty).map(puzzle => {
        const done = cleared.includes(puzzle.id);
        const preview = previews.puzzles[puzzle.id as keyof typeof previews.puzzles];
        return <li key={puzzle.id}>
          <OrnateFrame as={Link} size="sm" className={styles.problem} href={puzzleHref(puzzle.id)} prefetch={false} aria-label={`${puzzle.title}${done ? ' クリア済み' : ''}`}>
            <span className={styles.preview} data-puzzle-preview={puzzle.id}>
              <Image src={preview.src} alt={`${puzzle.title}の出題盤面`} width={preview.width} height={preview.height} sizes="(max-width: 900px) 70vw, 460px" unoptimized />
              <span className={styles.previewPlay}><PuzzleIcon name="play" /></span>
              {done && <span className={styles.cleared}><PuzzleIcon name="check" /></span>}
            </span>
            <div className={styles.problemFooter}>
              <b data-ui-title>{puzzle.title}</b>
              <span className={styles.start}><PuzzleIcon name="arrow" /></span>
            </div>
          </OrnateFrame>
        </li>;
      })}</ul>
    </section>)}
  </div>;
}
