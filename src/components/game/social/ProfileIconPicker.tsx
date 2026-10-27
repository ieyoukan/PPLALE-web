'use client';

import { useState } from 'react';
import { displayCards } from '@/lib/game/catalog';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import styles from './Social.module.css';

export function ProfileIconPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  return <section className={styles.iconPicker} aria-label="アイコンのカードを選択">
    <input aria-label="アイコンのカードを検索" value={query} onChange={event => setQuery(event.target.value)} placeholder="カード名で検索" />
    <div>{Object.values(displayCards).filter(card => card.name.includes(query)).map(card => <button type="button" key={card.id} aria-label={`${card.name}をアイコンにする`} aria-pressed={selected === card.id} onClick={() => onSelect(card.id)}>
      <span className={styles.avatar}><CardArtwork id={card.id} sizes="65px" /></span><small>{card.name}</small>
    </button>)}</div>
  </section>;
}
