'use client';

import Link from 'next/link';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { MISSIONS_PATH, introProgress } from '@/lib/game/introCourse';
import { usePuzzleProgress } from '@/lib/game/usePuzzleProgress';
import styles from './BeginnerMissions.module.css';

/** 入門編が未完了の本人にだけ、ルームの入口を表示する。 */
export function BeginnerMissionLink() {
  const { cleared, ready } = usePuzzleProgress();
  if (!ready || introProgress(cleared).done) return null;
  return <Link href={MISSIONS_PATH} prefetch={false} className={styles.entry} aria-label="初心者ミッション" title="初心者ミッション"><GameIcon name="beginner" /></Link>;
}
