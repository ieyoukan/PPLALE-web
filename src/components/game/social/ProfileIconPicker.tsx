'use client';

import { useState } from 'react';
import { displayCards } from '@/lib/game/catalog';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import styles from './Social.module.css';

export function ProfileIconPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const { t } = useI18n(), cardName = useCardName();
  // In English the English name is searched too (either case); Japanese searches the Japanese name as before.
  const matches = (id: string, name: string) => { const shown = cardName(id, name); return name.includes(query) || (shown !== name && shown.toLowerCase().includes(query.toLowerCase())); };
  return <section className={styles.iconPicker} aria-label={t('アイコンのカードを選択')}>
    <input aria-label={t('アイコンのカードを検索')} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('カード名で検索')} />
    <div>{Object.values(displayCards).filter(card => matches(card.id, card.name)).map(card => <button type="button" key={card.id} aria-label={t('{name}をアイコンにする', { name: cardName(card.id, card.name) })} aria-pressed={selected === card.id} onClick={() => onSelect(card.id)}>
      <span className={styles.avatar}><CardArtwork id={card.id} sizes="65px" /></span><small>{cardName(card.id, card.name)}</small>
    </button>)}</div>
  </section>;
}
