'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SavedDeckThumbnail from '@/components/deck/SavedDeckThumbnail';
import { MAX_PUBLIC_DECKS, readMyDecks, readPublicDecks } from '@/lib/game/social';
import type { PublicDeck } from '@/lib/game/social';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './Social.module.css';

/** A deck saved without a name is read as 無名のデッキ (lib/game/social.ts): that placeholder in the current language. */
function useDeckName() {
  const { t } = useI18n();
  return (name: string) => name === '無名のデッキ' ? t(name) : name;
}

/** The decks a profile shows; each opens the deck's shared page. */
export function PublicDecks({ uid, ids }: { uid: string; ids: string[] }) {
  const [decks, setDecks] = useState<PublicDeck[]>([]);
  const { t } = useI18n();
  const deckName = useDeckName();
  const key = ids.join(',');
  useEffect(() => {
    let current = true;
    void readPublicDecks(uid, key ? key.split(',') : []).then(value => { if (current) setDecks(value); }, () => {});
    return () => { current = false; };
  }, [uid, key]);
  if (!decks.length) return null;
  return <section className={styles.decks} aria-label={t('公開しているデッキ')}>
    {decks.map(deck => <Link key={deck.id} className={styles.deck} href={`/deck/${uid}/${deck.id}`}><SavedDeckThumbnail deck={deck} /><b>{deckName(deck.name)}</b></Link>)}
  </section>;
}

/** Choosing, from the player's saved decks, up to MAX_PUBLIC_DECKS to show (saved with the profile). */
export function DeckChooser({ uid, chosen, onChange }: { uid: string; chosen: string[]; onChange: (ids: string[]) => void }) {
  const [decks, setDecks] = useState<PublicDeck[] | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    let current = true;
    void readMyDecks(uid).then(value => { if (current) setDecks(value); }, () => { if (current) setDecks([]); });
    return () => { current = false; };
  }, [uid]);
  const deckName = useDeckName();
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter(other => other !== id) : [...chosen, id].slice(-MAX_PUBLIC_DECKS));
  return <fieldset className={styles.deckChooser}>
    <legend>{t('公開するデッキ')}<small>{chosen.length} / {MAX_PUBLIC_DECKS}</small></legend>
    {decks === null ? <p role="status">{t('読み込み中…')}</p> : !decks.length ? <p><Link href="/build/">{t('デッキを作る ›')}</Link></p>
      : <div>{decks.map(deck => <button type="button" key={deck.id} aria-pressed={chosen.includes(deck.id)} aria-label={t('{name}を公開する', { name: deckName(deck.name) })} onClick={() => toggle(deck.id)}>
        <SavedDeckThumbnail deck={deck} /><b>{deckName(deck.name)}</b>{chosen.includes(deck.id) && <span className={styles.deckMark}><GameIcon name="check" /></span>}
      </button>)}</div>}
  </fieldset>;
}
