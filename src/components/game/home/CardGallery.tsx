'use client';

// 図鑑: every card the game knows, by kind (the launchpad's heading names it). Tap one to read it large.
import { useRef, useState } from 'react';
import { displayCards } from '@/lib/game/catalog';
import { englishCard } from '@/lib/game/skillText';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { GameCard } from '../GameCard';
import CardDetail from '@/components/shared/card/CardDetail';
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
  const trigger = useRef<HTMLButtonElement | null>(null);
  const { locale, t } = useI18n();
  const cardName = useCardName();
  const shown = all.filter(groups.find(g => g.id === group)!.has);
  // Read large in the current language: the English card (name, text, picture) when there is one.
  const card = open ? locale === 'en' && englishCard(open) || displayCards[open] : null;
  return <><div className={styles.gallery} inert={!!card}>
    <div className={styles.tabs} role="tablist" aria-label={t('カードの種類')}>{groups.map(g =>
      <button key={g.id} role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}>{t(g.label)}<small>{all.filter(g.has).length}</small></button>)}
    </div>
    <ul className={styles.grid}>{shown.map(id => <li key={id}>
      <button onClick={event => { trigger.current = event.currentTarget; setOpen(id); }} aria-label={cardName(id, displayCards[id].name)}><GameCard id={id} sizes="(max-width: 700px) 30vw, 180px" /></button>
    </li>)}</ul>
  </div>
    {card && <CardDetail card={card} onClose={() => setOpen(null)} isInDeck={false} returnFocusRef={trigger} />}
  </>;
}
