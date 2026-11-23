'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { lethalPuzzles } from '@/lib/game/puzzles';
import { useUnlockedPuzzles } from '@/lib/game/lockedPuzzles';
import type { LethalPuzzle } from '@/lib/game/puzzles';
import { localMatchCardIds } from '@/lib/game/matchAssets';
import { PUZZLES_PATH } from '@/lib/game/sessionStore';
import { useI18n } from '@/i18n/LocaleProvider';
import { MatchAssetGate } from '../MatchPreparation';
import { usePuzzleSession } from './usePuzzleSession';
import styles from './Puzzles.module.css';

const BoardTable = dynamic(() => import('../BoardEmulator').then(module => module.BoardTable));
const ids = localMatchCardIds([]);

export default function PuzzlePlay() {
  const id = useSearchParams().get('id');
  const unlocked = useUnlockedPuzzles();
  const problem = lethalPuzzles.find(puzzle => puzzle.id === id) ?? unlocked.puzzles.find(puzzle => puzzle.id === id);
  const { t } = useI18n();
  if (!problem && !unlocked.ready) return null;
  if (!problem) return <div className={styles.missing}><p>{t('このパズルは見つかりませんでした。')}</p><Link href={PUZZLES_PATH}>{t('問題一覧へ')}</Link></div>;
  return <MatchAssetGate ids={ids} cpu><PuzzleBoard key={problem.id} problem={problem} /></MatchAssetGate>;
}

function PuzzleBoard({ problem }: { problem: LethalPuzzle }) {
  const session = usePuzzleSession(problem);
  return <BoardTable session={session} />;
}
