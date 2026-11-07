'use client';

// ランチパッドの横の案内役。開くたびに前回と違う1人が右の縁から現れ、名前とひとことの吹き出しを少し出す。
// 押すとピョコと鳴ってランチパッドの裏へ引っ込み、吹き出しも消えて、そのランチパッドを閉じるまで出てこない。
// 次に開いたときは別の人が出てくる。基準は public/images/game/characters/README.md。
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { gameAudio } from '@/lib/game/gameAudio';
import { GUIDES } from './guides';
import type { Guide } from './guides';
import styles from './GameGuide.module.css';

let last: string | null = null;

/** A different guide from the last one, each time the launchpad opens (the guide is made anew with it). */
function pick() {
  const others = GUIDES.filter(guide => guide.id !== last);
  const guide = others[Math.floor(Math.random() * others.length)];
  last = guide.id;
  return guide;
}

/**
 * `className` places the guide (behind the launchpad); `wordsClassName` places its words over the same box, in front of
 * the launchpad, so the bubble is never covered by it.
 */
export function GameGuide({ className, wordsClassName }: { className?: string; wordsClassName?: string }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [ready, setReady] = useState(false);
  const [hiding, setHiding] = useState(false);
  // Chosen once for this opening (an effect run twice in development must not choose again, or "not the last one" breaks).
  const chosen = useRef<Guide | null>(null);
  useEffect(() => {
    chosen.current ??= pick();
    setGuide(chosen.current);
  }, []);

  // Once pressed, the guide stays tucked away (and quiet) until the launchpad is closed.
  const tap = () => {
    if (hiding) return;
    gameAudio().play('pop');
    setHiding(true);
  };

  return <>
    <span className={`${styles.guide} ${className ?? ''}`} data-game-guide={guide?.id} data-guide-ready={ready || undefined} data-hiding={hiding || undefined}>
      {guide && <button type="button" className={styles.body} onClick={tap} aria-label={guide.name} disabled={hiding}>
        <Image className={styles.art} src={`/images/game/characters/${guide.image}.webp`} alt="" width={guide.width} height={guide.height} sizes="360px" loading="eager" draggable={false} onLoad={() => setReady(true)} />
      </button>}
    </span>
    {/* --shape: the picture's height to its width, so the words sit at the head of each one (GameGuide.module.css). */}
    {guide && ready && !hiding && <span className={`${styles.wordsLayer} ${className ?? ''} ${wordsClassName ?? ''}`} data-guide-ready
      style={{ '--shape': guide.height / guide.width } as CSSProperties}>
      <span className={styles.words} role="status"><b>{guide.name}</b>{guide.line}</span>
    </span>}
  </>;
}
