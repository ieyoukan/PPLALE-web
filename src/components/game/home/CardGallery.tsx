'use client';

// 図鑑: every card the game knows, by kind. Tap one to read it large.
import { useState } from 'react';
import Link from 'next/link';
import { displayCards } from '@/lib/game/catalog';
import { HOME_PATH } from '@/lib/game/sessionStore';
import { GameCard } from '../GameCard';
import styles from './CardGallery.module.css';

const groups = [
  { id: 'yojo', label: '幼女', has: (id: string) => id.startsWith('y_') },
  { id: 'sweet', label: 'お菓子', has: (id: string) => id.startsWith('s_') },
  { id: 'playable', label: 'プレイアブル', has: (id: string) => id.startsWith('p_') },
  { id: 'token', label: 'トークン', has: (id: string) => id.startsWith('yt_') || id.startsWith('token_') },
] as const;
const all = Object.keys(displayCards);

export default function CardGallery() {
  const [group, setGroup] = useState<(typeof groups)[number]['id']>('yojo');
  const [open, setOpen] = useState<string | null>(null);
  const shown = all.filter(groups.find(g => g.id === group)!.has), card = open ? displayCards[open] : null;
  return <main className={styles.gallery}>
    <header className={styles.heading}>
      <h1>カード図鑑</h1>
      <Link href={HOME_PATH}>ホームへ</Link>
    </header>
    <div className={styles.tabs} role="tablist" aria-label="カードの種類">{groups.map(g =>
      <button key={g.id} role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}>{g.label}<small>{all.filter(g.has).length}</small></button>)}
    </div>
    <ul className={styles.grid}>{shown.map(id => <li key={id}>
      <button onClick={() => setOpen(id)} aria-label={displayCards[id].name}><GameCard id={id} sizes="(max-width: 700px) 30vw, 180px" /></button>
    </li>)}</ul>
    {card && <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={card.name} onClick={() => setOpen(null)}>
      <div className={styles.sheet} onClick={event => event.stopPropagation()}>
        <div className={styles.large}><GameCard id={card.id} sizes="(max-width: 700px) 80vw, 420px" /></div>
        <div className={styles.text}>
          <h2>{card.name}</h2>
          {card.effect && <p>{card.effect}</p>}
          <button onClick={() => setOpen(null)}>閉じる</button>
        </div>
      </div>
    </div>}
  </main>;
}
