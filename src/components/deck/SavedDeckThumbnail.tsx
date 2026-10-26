'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { css } from 'styled-system/css';
import { getCardCatalog } from '@/data/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import { DECK_IMAGE_ASPECT } from '@/lib/deckImageLayout';
import { DeckCardLayout } from '@/components/shared/deck/DeckCardLayout';
import type { SavedDeckSummary } from './useSavedDeckPages';

export default function SavedDeckThumbnail({ deck }: { deck: SavedDeckSummary }) {
  const { locale, t } = useI18n();
  const target = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const hasCards = deck.yojoDeckIds.length > 0 || deck.sweetDeckIds.length > 0 || !!deck.playableCardId;
  const cards = useMemo(() => {
    if (!nearby) return new Map<string, string>();
    const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
    return new Map([...allYojoCards, ...allSweetCards, ...allPlayableCards].map(card => [card.id, card.imageUrl]));
  }, [nearby, locale]);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) { setNearby(true); return; }
    const observer = new IntersectionObserver(entries => {
      setNearby(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: '300px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Native image decoding and SVG layout: no canvas drawing or PNG encoding on the UI thread.
  return <div ref={target} style={{ aspectRatio: DECK_IMAGE_ASPECT }} className={css({
    position: 'relative', bg: 'orange.100', rounded: 'md', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center', _dark: { bg: 'gray.700' },
  })}>
    {nearby && hasCards ? <DeckCardLayout deck={deck} label={locale === 'ja' ? `${deck.name || t('無名のデッキ')}のデッキ画像` : `Deck image for ${deck.name || t('無名のデッキ')}`} imageOf={id => cards.get(id)?.replace(/^\/images\//, '/deck-thumbnails/')} /> : <span className={css({ fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.300' } })}>{t(hasCards ? '読み込み中...' : 'デッキにカードがありません')}</span>}
  </div>;
}
