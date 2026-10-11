'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { css } from 'styled-system/css';
import { getCardCatalog } from '@/data/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import type { SavedDeckSummary } from './useSavedDeckPages';

export default function SavedDeckThumbnail({ deck }: { deck: SavedDeckSummary }) {
  const { locale, t } = useI18n();
  const target = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const hasCards = deck.yojoDeckIds.length > 0 || deck.sweetDeckIds.length > 0 || !!deck.playableCardId;
  const images = useMemo(() => {
    if (!nearby) return [];
    const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
    const yojo = new Map(allYojoCards.map(card => [card.id, card.imageUrl]));
    const sweet = new Map(allSweetCards.map(card => [card.id, card.imageUrl]));
    const order = (ids: string[], max: number) => ids.slice(0, max).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
    const playable = allPlayableCards.find(card => card.id === deck.playableCardId);
    return [
      ...order(deck.yojoDeckIds, 20).map((id, i) => ({ src: yojo.get(id), x: (i % 5) * 170, y: Math.floor(i / 5) * 270, width: 162, height: 262 })),
      ...order(deck.sweetDeckIds, 10).map((id, i) => ({ src: sweet.get(id), x: 855 + (i % 5) * 215, y: Math.floor(i / 5) * 343, width: 205, height: 333 })),
      ...(playable ? [{ src: playable.imageUrl, x: 852, y: 677, width: 264, height: 393 }] : []),
    ];
  }, [nearby, deck, locale]);

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
  return <div ref={target} className={css({
    aspectRatio: '16/9', position: 'relative', bg: 'orange.100', rounded: 'md', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center', _dark: { bg: 'gray.700' },
  })}>
    {nearby && hasCards ? <svg viewBox="0 0 1920 1080" role="img" aria-label={locale === 'ja' ? `${deck.name || t('無名のデッキ')}のデッキ画像` : `Deck image for ${deck.name || t('無名のデッキ')}`}
      className={css({ w: 'full', h: 'full' })}>
      {images.map((image, i) => image.src && <image key={i} href={image.src.replace(/^\/images\//, '/deck-thumbnails/')} x={image.x} y={image.y} width={image.width} height={image.height} preserveAspectRatio="none" />)}
    </svg> : <span className={css({ fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.300' } })}>{t(hasCards ? '読み込み中...' : 'デッキにカードがありません')}</span>}
  </div>;
}
