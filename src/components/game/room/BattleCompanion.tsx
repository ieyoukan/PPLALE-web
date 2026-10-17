'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import styles from './Room.module.css';

const companions = [
  'guide-01.webp', 'guide-02.webp', 'guide-03.webp', 'guide-04.webp',
  'guide-05.webp', 'guide-06.webp', 'guide-07.webp',
] as const;

/** Choose once per visit, after hydration; form updates keep the same guide. */
export function BattleCompanion() {
  const [illustration, setIllustration] = useState<string | null>(null);
  const [reaction, setReaction] = useState(0);
  useEffect(() => {
    setIllustration(companions[Math.floor(Math.random() * companions.length)]);
  }, []);

  return <div className={styles.companion}>
    <button type="button" className={styles.companionTap} aria-label="案内役をタップ"
      disabled={!illustration} onClick={() => setReaction(previous => previous + 1)}>
      <span key={reaction} className={styles.companionCharacter} data-reacting={reaction > 0 || undefined}>
        {illustration && <Image src={`/images/game/characters/${illustration}`} alt="" fill
          sizes="(max-width: 720px) 280px, (max-width: 1000px) 340px, 400px" loading="eager" />}
      </span>
    </button>
  </div>;
}
