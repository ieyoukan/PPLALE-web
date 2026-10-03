'use client';

import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from './EffectBlockAnnouncement.module.css';

/** Show which Jonko stopped damage or destruction, without interrupting with a dialog. */
export function EffectBlockAnnouncement() {
  const blocked = useBoardContext().animations.blocked;
  if (!blocked) return null;
  const first = blocked.targets[0];
  return <div key={blocked.id} className={styles.layer} role="status" aria-live="assertive">
    {blocked.targets.filter(target => target.width > 0).map(target => <div key={target.uid} className={styles.shield} aria-hidden="true"
      style={{ left: target.x, top: target.y, width: target.width, height: target.height }}>
      <span>✋</span>
    </div>)}
    <div className={styles.notice}>
      <div className={styles.card}><GameCard id={first.cardId} sizes="(max-width: 700px) 30vw, 220px" /></div>
      <div className={styles.words}>
        <strong>じょんこが止めた！</strong>
        <span>{first.kind === 'damage' ? 'ダメージを防いだ' : '破壊を防いだ'}</span>
      </div>
    </div>
  </div>;
}
