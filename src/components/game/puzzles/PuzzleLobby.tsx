'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { lethalPuzzles, readClearedPuzzles } from '@/lib/game/puzzles';
import { puzzleHref } from '@/lib/game/sessionStore';
import previews from '@/data/lethalPuzzlePreviews.json';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { PuzzleIcon } from './PuzzleIcon';
import styles from './Puzzles.module.css';

export default function PuzzleLobby() {
  const [cleared, setCleared] = useState<string[]>([]);
  useEffect(() => { setCleared(readClearedPuzzles()); }, []);
  return <div className={styles.lobby}>
    <div className={styles.intro}>
      <progress max={lethalPuzzles.length} value={cleared.length} aria-label="パズルのクリア状況" />
      <span aria-label={`${lethalPuzzles.length}問中${cleared.length}問クリア`}>{cleared.length} / {lethalPuzzles.length}</span>
    </div>
    {['初級', '中級'].map(difficulty => <section key={difficulty}>
      <h2 data-ui-title>メロン {difficulty}</h2>
      <ul className={styles.grid}>{lethalPuzzles.filter(puzzle => puzzle.difficulty === difficulty).map(puzzle => {
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
