'use client';

// ランチパッドの横の案内役。開くたびに前回と違う1人が右の縁から現れ、名前とひとことの吹き出しを少し出す。
// 押すとピョコと鳴ってランチパッドの裏へ引っ込み、吹き出しも消えて、そのランチパッドを閉じるまで出てこない。
// 次に開いたときは別の人が出てくる。基準は public/images/game/characters/README.md。
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { gameAudio } from '@/lib/game/gameAudio';
import styles from './GameGuide.module.css';

export interface Guide { id: string; name: string; line: string; image: string; width: number; height: number }

/** The guides and what each says when the launchpad opens (ユーザー指定、2026-11-07). */
export const GUIDES: Guide[] = [
  { id: 'gato', name: 'がと', line: '何する？いっぱいあるよー！', image: 'guide-gato', width: 502, height: 1000 },
  { id: 'chori', name: 'ちょり', line: 'どこいく?どこいく〜?', image: 'guide-chori', width: 487, height: 1000 },
  { id: 'nao', name: 'なお', line: 'え..みんなどっか行っちゃった?', image: 'guide-nao', width: 426, height: 693 },
  { id: 'iriai', name: 'いりあい', line: 'どこいこうかな!', image: 'guide-iriai', width: 400, height: 1000 },
  { id: 'rikusu', name: 'りくす', line: 'なん!', image: 'guide-rikusu', width: 471, height: 1000 },
  { id: 'gitty', name: 'ぎってぃ', line: 'にゃるる、どんぐ...じゃなくて', image: 'mug-gitty', width: 419, height: 640 },
  { id: 'shuo', name: 'しゅお', line: 'Auf der Heide blüht ein kleines Blümelein', image: 'mug-shuo', width: 341, height: 640 },
  { id: 'buran', name: 'ぶらん', line: 'どこいこうかなーー！！', image: 'buran', width: 663, height: 720 },
  { id: 'mika', name: 'みか', line: 'みかちゃんだよ！えへへ!', image: 'mika', width: 507, height: 720 },
];

let last: string | null = null;

/** A different guide from the last one, each time the launchpad opens (the guide is made anew with it). */
function pick() {
  const others = GUIDES.filter(guide => guide.id !== last);
  const guide = others[Math.floor(Math.random() * others.length)];
  last = guide.id;
  return guide;
}

export function GameGuide({ className }: { className?: string }) {
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

  return <span className={`${styles.guide} ${className ?? ''}`} data-game-guide={guide?.id} data-guide-ready={ready || undefined} data-hiding={hiding || undefined}>
    {guide && <>
      <button type="button" className={styles.body} onClick={tap} aria-label={guide.name} disabled={hiding}>
        <Image className={styles.art} src={`/images/game/characters/${guide.image}.webp`} alt="" width={guide.width} height={guide.height} sizes="360px" loading="eager" draggable={false} onLoad={() => setReady(true)} />
      </button>
      {ready && !hiding && <span className={styles.words} role="status"><b>{guide.name}</b>{guide.line}</span>}
    </>}
  </span>;
}
