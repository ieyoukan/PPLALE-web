'use client';

import Image from 'next/image';
import Link from 'next/link';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { ScreenSubtitle } from '@/components/shared/ui/ScreenSubtitle';
import { introLessons, introProgress } from '@/lib/game/introCourse';
import { puzzleHref, puzzleListHref } from '@/lib/game/sessionStore';
import { usePuzzleProgress } from '@/lib/game/usePuzzleProgress';
import styles from './BeginnerMissions.module.css';

export function BeginnerMissions() {
  const { cleared } = usePuzzleProgress();
  const progress = introProgress(cleared);
  return <div className={styles.missions}>
    <div className={styles.hero}>
      <Image src="/images/game/characters/home-rabbit.webp" width={128} height={128} alt="" />
      <div><ScreenSubtitle>はじめてのぷぷりえーる</ScreenSubtitle><p>盤面で試して、遊び方を覚えよう。</p></div>
    </div>
    <OrnateFrame size="sm" className={styles.mission}>
      <header><GameIcon name="beginner" /><h3 data-ui-title>入門編をクリアする</h3><b>{progress.completed} / {progress.total}</b></header>
      <progress value={progress.completed} max={progress.total} aria-label="入門編のクリア状況" />
      {progress.next
        ? <Link className={styles.start} href={puzzleHref(progress.next.id)} prefetch={false}>{progress.completed ? 'つづきから' : 'はじめる'}<GameIcon name="enter" /></Link>
        : <p className={styles.achieved} role="status"><GameIcon name="check" />ミッション達成！</p>}
      <ol className={styles.lessons}>
        {introLessons.map((problem, index) => <li key={problem.id} data-cleared={cleared.includes(problem.id) || undefined}>
          <Link href={puzzleHref(problem.id)} prefetch={false}>
            <span className={styles.step}>{cleared.includes(problem.id) ? <GameIcon name="check" /> : index + 1}</span>
            <span><small>入門{index + 1}</small><b>{problem.lesson.title}</b></span>
            <GameIcon name="enter" />
          </Link>
        </li>)}
      </ol>
      <Link className={styles.listLink} href={puzzleListHref('intro')} prefetch={false}>入門編の一覧</Link>
    </OrnateFrame>
    <small className={styles.saveNote}>クリア状況はこのブラウザに保存されます。</small>
  </div>;
}
