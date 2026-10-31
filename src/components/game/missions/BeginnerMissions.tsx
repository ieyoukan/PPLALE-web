'use client';

import Image from 'next/image';
import Link from 'next/link';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { introLessons, introProgress } from '@/lib/game/introCourse';
import { puzzleHref } from '@/lib/game/sessionStore';
import { usePuzzleProgress } from '@/lib/game/usePuzzleProgress';
import styles from './BeginnerMissions.module.css';

export function BeginnerMissions() {
  const { cleared } = usePuzzleProgress();
  const progress = introProgress(cleared);
  return <div className={styles.missions}>
    <header className={styles.hero}>
      <div><h3 data-ui-title>入門編をクリアする</h3><p>ひとつずつ、盤面で覚えよう。</p></div>
      <Image src="/images/game/characters/home-rabbit.webp" width={96} height={96} alt="" />
    </header>
    <div className={styles.progress}>
      <progress value={progress.completed} max={progress.total} aria-label="入門編のクリア状況" />
      <b>{progress.completed} / {progress.total}</b>
    </div>
    {progress.done && <p className={styles.achieved} role="status"><GameIcon name="check" />ミッション達成！</p>}
    <ol className={styles.lessons}>
      {introLessons.map((problem, index) => {
        const done = cleared.includes(problem.id), current = progress.next?.id === problem.id;
        return <li key={problem.id} data-cleared={done || undefined} data-current={current || undefined}>
          <Link href={puzzleHref(problem.id)} prefetch={false} aria-current={current ? 'step' : undefined}>
            <span className={styles.step} aria-hidden="true">{done ? <GameIcon name="check" /> : index + 1}</span>
            <span className={styles.lessonText}>
              <span className={styles.lessonLabel}><small data-ui-title>入門{index + 1}</small>{current && <em>{progress.completed ? 'つぎはここ' : 'ここから'}</em>}{done && <em>クリア</em>}</span>
              <b>{problem.lesson.title}</b>
            </span>
            <GameIcon name="enter" />
          </Link>
        </li>;
      })}
    </ol>
    <small className={styles.saveNote}>クリア状況はこのブラウザに保存されます。</small>
  </div>;
}
