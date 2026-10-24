'use client';

// The screen between opening the game (or a shared link) and the room: the logo and one card,
// chosen once, with what it does in the card's own words. No bar or percentage: it goes away as
// soon as the room is ready. While a room is being looked for there is nothing else to do.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { fruitNames } from '@pplale/game-core';
import type { Fruit } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import styles from './LaunchScreen.module.css';

interface Shown { id: string; name: string; image: string; kind: string; fruit: string; effect: string }

/** Where the stars twinkle (spread over the screen, the same on every visit). */
const stars = Array.from({ length: 14 }, (_, index) => [6 + index * 37 % 88, 8 + index * 53 % 84, -0.41 * index] as const);

/** A yojo or sweet whose effect is short enough to read while waiting. */
function someCard(): Shown | null {
  const cards = Object.values(displayCards).flatMap(card => {
    const { type, effect, imageUrl } = card as { type?: string; effect?: string; imageUrl?: string };
    if ((type !== 'yojo' && type !== 'sweet') || !imageUrl || !effect || Array.from(effect).length > 90) return [];
    const { id, name, fruit } = card as unknown as { id: string; name: string; fruit: Fruit };
    return [{ id, name, image: imageUrl, kind: type === 'yojo' ? '幼女' : 'お菓子', fruit: fruitNames[fruit] ?? '', effect }];
  });
  return cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
}

/** `status`: what is happening, for screen readers (and below the card). `children`: what to do when it failed. */
export function LaunchScreen({ status = 'ルームを準備しています', children }: { status?: string; children?: ReactNode }) {
  // Chosen in the browser after the first paint, so the page itself can be sent before scripts run.
  const [card, setCard] = useState<Shown | null>(null);
  useEffect(() => { setCard(someCard()); }, []);
  return <section className={styles.launch} aria-busy={!children} aria-label="ぷぷりえーる">
    <span className={styles.stars} aria-hidden="true">{stars.map(([left, top, delay], index) => <i key={index} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} />)}</span>
    <Image className={styles.logo} src="/images/game/logo.webp" alt="お菓子争奪戦争 ぷぷりえーる" width={462} height={227} priority />
    <div className={styles.feature} data-shown={card ? '' : undefined}>
      <span className={styles.cardArt}>{card && <Image src={card.image} alt="" fill sizes="240px" priority />}</span>
      {card && <div className={styles.cardText}>
        <span className={styles.chips}><b>{card.kind}</b>{card.fruit && <b>{card.fruit}</b>}</span>
        <h2 data-ui-title>{card.name}</h2>
        <p>{card.effect}</p>
      </div>}
    </div>
    {children ? <div className={styles.trouble}>{children}</div>
      : <p className={styles.status} role="status"><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><span>{status}</span></p>}
  </section>;
}
