'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import styles from './GameGuide.module.css';

const guides = ['guide-01', 'guide-02', 'guide-03', 'guide-06', 'guide-07'] as const;
type Guide = typeof guides[number];
let chosen: Guide | null = null;

/** 起動中は同じ案内役を使い、ルーム移動やメニューの開閉では選び直さない。 */
export function GameGuide({ className }: { className?: string }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  useEffect(() => {
    chosen ??= guides[Math.floor(Math.random() * guides.length)];
    setGuide(chosen);
  }, []);
  return <span className={`${styles.guide} ${className ?? ''}`} data-game-guide={guide ?? undefined} aria-hidden="true">
    {guide && <Image className={styles.art} src={`/images/game/characters/${guide}.webp`} alt="" width={720} height={1000} sizes="240px" loading="eager" draggable={false} />}
  </span>;
}
