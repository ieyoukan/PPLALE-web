'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { deleteDoc, doc } from 'firebase/firestore';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { db } from '@/lib/firebase';
import { useI18n } from '@/i18n/LocaleProvider';
import { getCardCatalog } from '@/data/catalog';
import SavedDeckThumbnail from './SavedDeckThumbnail';
import { useSavedDeckPages } from './useSavedDeckPages';
import type { SavedDeckSummary } from './useSavedDeckPages';

const fieldClass = css({ w: 'full', rounded: 'md', borderWidth: '1px', borderColor: 'gray.300', bg: 'white', px: '3', py: '2', color: 'gray.900', _dark: { borderColor: 'gray.600', bg: 'gray.800', color: 'gray.100' } });
const labelClass = css({ display: 'grid', gap: '1', fontSize: 'sm', color: 'gray.600', _dark: { color: 'gray.300' } });
const DISPLAY_PAGE_SIZE = 12;
const FRUIT_OPTIONS = ['strawberry', 'grape', 'melon', 'orange'] as const;
type DeckFruit = typeof FRUIT_OPTIONS[number];
type DeckSort = 'updated-desc' | 'updated-asc' | 'name-asc' | 'name-desc';

export default function SavedDeckGrid({ userId }: { userId: string }) {
  const { locale, t, fruitLabel } = useI18n();
  const { decks, isLoading, hasMore, error, loadMore, removeDeck } = useSavedDeckPages(userId);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<DeckSort>('updated-desc');
  const [fruits, setFruits] = useState<DeckFruit[]>([]);
  const [playable, setPlayable] = useState('all');
  const [displayCount, setDisplayCount] = useState(DISPLAY_PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<SavedDeckSummary | null>(null);
  const [notice, setNotice] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);
  const search = useDeferredValue(filter.trim().normalize('NFKC').toLocaleLowerCase(locale));
  const needsAll = !!search || fruits.length > 0 || playable !== 'all' || sort !== 'updated-desc';
  const catalog = getCardCatalog(locale);
  const filteredDecks = useMemo(() => {
    const cards = new Map([...catalog.allYojoCards, ...catalog.allSweetCards].map(card => [card.id, card]));
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    const filtered = decks.filter(deck => {
      if (!(deck.name || t('無名のデッキ')).normalize('NFKC').toLocaleLowerCase(locale).includes(search)) return false;
      if (playable !== 'all' && (playable === 'none' ? !!deck.playableCardId : deck.playableCardId !== playable)) return false;
      if (fruits.length === 0) return true;
      const deckFruits = new Set<string>();
      for (const id of [...deck.yojoDeckIds, ...deck.sweetDeckIds]) {
        const fruit = cards.get(id)?.fruit;
        // Common sweets do not add another fruit to the deck's combination.
        if (fruit && fruit !== 'all') deckFruits.add(fruit);
      }
      return deckFruits.size === fruits.length && fruits.every(fruit => deckFruits.has(fruit));
    });
    return filtered.sort((a, b) => {
      const result = sort.startsWith('name') ? collator.compare(a.name || t('無名のデッキ'), b.name || t('無名のデッキ'))
        : (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0);
      return (sort.endsWith('desc') ? -result : result) || a.id.localeCompare(b.id);
    });
  }, [decks, search, playable, fruits, sort, catalog, locale, t]);
  const visibleDecks = filteredDecks.slice(0, displayCount);
  const canShowMore = filteredDecks.length > displayCount || hasMore;

  useEffect(() => { setDisplayCount(DISPLAY_PAGE_SIZE); }, [search, sort, fruits, playable]);

  function showMore() {
    setDisplayCount(previous => previous + DISPLAY_PAGE_SIZE);
    if (error || (filteredDecks.length <= displayCount && hasMore)) void loadMore();
  }

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !canShowMore || error || (isLoading && filteredDecks.length <= displayCount) || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setDisplayCount(previous => previous + DISPLAY_PAGE_SIZE);
        if (filteredDecks.length <= displayCount && hasMore && !isLoading) void loadMore();
      }
    }, { rootMargin: '500px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, hasMore, canShowMore, isLoading, error, displayCount, filteredDecks.length]);

  // Search includes older pages too, even if no current match reaches the scroll sentinel.
  useEffect(() => {
    if (needsAll && hasMore && !isLoading && !error) void loadMore();
  }, [needsAll, hasMore, isLoading, error, loadMore]);

  return <section aria-labelledby="saved-decks-title">
    <div className={css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4', mb: '6' })}>
      <div>
        <h2 id="saved-decks-title" className={css({ fontSize: '2xl', fontWeight: 'semibold', color: 'gray.900', _dark: { color: 'gray.100' } })}>{t('デッキ一覧')}</h2>
      </div>
    </div>
    <div className={css({ display: 'grid', gap: '3', gridTemplateColumns: 'minmax(0, 1fr)', sm: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, lg: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, mb: '4' })}>
      <label className={labelClass}>{t('デッキ名でフィルター')}<input type="search" placeholder={t('デッキ名でフィルター')} value={filter} onChange={event => setFilter(event.target.value)} className={fieldClass} /></label>
      <label className={labelClass}>{t('並び順')}<select value={sort} onChange={event => setSort(event.target.value as DeckSort)} className={fieldClass}>
        <option value="updated-desc">{t('更新が新しい順')}</option><option value="updated-asc">{t('更新が古い順')}</option>
        <option value="name-asc">{t('名前の昇順')}</option><option value="name-desc">{t('名前の降順')}</option>
      </select></label>
      <label className={labelClass}>{t('プレイアブルカード')}<select value={playable} onChange={event => setPlayable(event.target.value)} className={fieldClass}>
        <option value="all">{t('すべて')}</option><option value="none">{t('未選択')}</option>
        {catalog.allPlayableCards.map(card => <option key={card.id} value={card.id}>{card.name}{card.version === 'beta' ? '（ExP）' : ''}</option>)}
      </select></label>
      <fieldset className={css({ gridColumn: '1 / -1', minW: '0' })}>
        <legend className={css({ mb: '2', fontSize: 'sm', color: 'gray.600', _dark: { color: 'gray.300' } })}>
          {t('フルーツ')}<span className={css({ ml: '2', fontSize: 'xs' })}>{t('選択した組み合わせのみ')}</span>
        </legend>
        <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2', alignItems: 'center' })}>
          <button type="button" aria-pressed={fruits.length === 0} onClick={() => setFruits([])} className={button({ variant: fruits.length === 0 ? 'primary' : 'outline', size: 'sm' })}>{t('すべて')}</button>
          {FRUIT_OPTIONS.map(fruit => <label key={fruit} className={css({
            display: 'flex', alignItems: 'center', gap: '2', px: '3', py: '2', rounded: 'md', cursor: 'pointer', fontSize: 'sm',
            borderWidth: '1px', borderColor: 'gray.300', bg: 'white', color: 'gray.900',
            _dark: { borderColor: 'gray.600', bg: 'gray.800', color: 'gray.100' },
          })}>
            <input type="checkbox" checked={fruits.includes(fruit)} onChange={event => {
              const checked = event.target.checked;
              setFruits(previous => checked ? [...previous, fruit] : previous.filter(value => value !== fruit));
            }} className={css({ w: '4', h: '4', accentColor: 'blue.600' })} />{fruitLabel(fruit)}
          </label>)}
        </div>
      </fieldset>
    </div>
    {needsAll && <button type="button" onClick={() => { setFilter(''); setSort('updated-desc'); setFruits([]); setPlayable('all'); }} className={`${button({ variant: 'ghost', size: 'sm' })} ${css({ mb: '4' })}`}>{t('条件をリセット')}</button>}
    {notice && <p role="status" className={css({ mb: '4', color: 'green.700', _dark: { color: 'green.300' } })}>{notice}</p>}
    <ul className={css({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', sm: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, lg: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, gap: '5' })}>
      {visibleDecks.map(deck => <li key={deck.id} className={css({
        minW: '0', display: 'flex', flexDirection: 'column', rounded: 'lg', borderWidth: '1px', borderColor: 'gray.200', bg: 'white',
        overflow: 'hidden', boxShadow: 'xs', _dark: { borderColor: 'gray.700', bg: 'gray.800' },
      })}>
        <Link href={`/deck/${userId}/${deck.id}`} prefetch={false} className={css({ display: 'block', flex: '1', p: '3', _hover: { bg: 'gray.50' }, _dark: { _hover: { bg: 'gray.700/40' } } })}>
          <SavedDeckThumbnail deck={deck} />
          <h3 className={css({ mt: '3', fontWeight: 'semibold', overflowWrap: 'anywhere', color: 'gray.800', _dark: { color: 'gray.100' } })}>{deck.name || t('無名のデッキ')}</h3>
          <p className={css({ mt: '1', fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.400' } })}>
            {t('最終更新')}: {deck.updatedAt ? deck.updatedAt.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US') : '—'}
          </p>
        </Link>
        <div className={css({ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '2', borderTopWidth: '1px', borderColor: 'gray.100', px: '3', py: '2', _dark: { borderColor: 'gray.700' } })}>
          <CopyDeckLinkButton deck={deck} userId={userId} onCopyStart={() => setNotice('')} />
          <button type="button" onClick={() => { setNotice(''); setDeleteTarget(deck); }} className={button({ variant: 'ghost', size: 'sm' })} aria-label={`${deck.name || t('無名のデッキ')}: ${t('デッキを削除')}`}>{t('削除')}</button>
        </div>
      </li>)}
    </ul>
    {!isLoading && !hasMore && !error && visibleDecks.length === 0 && <p className={css({ py: '12', textAlign: 'center', color: 'gray.500', _dark: { color: 'gray.400' } })}>
      {t(needsAll ? '条件に合うデッキがありません' : '保存したデッキがありません')}
    </p>}
    <div ref={sentinel} className={css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3', py: '8' })}>
      <p role="status" className={css({ fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.400' } })}>
        {isLoading ? t(needsAll ? 'デッキを検索・並べ替え中...' : '読み込み中...') : !canShowMore && decks.length > 0 ? t('すべてのデッキを表示しました') : ''}
      </p>
      {error && <p role="alert" className={css({ color: 'red.600', _dark: { color: 'red.300' } })}>{t('デッキを読み込めませんでした')}</p>}
      {canShowMore && (!isLoading || filteredDecks.length > displayCount) && <button type="button" onClick={showMore} className={button({ variant: 'outline', size: 'md' })}>{t(error ? '再読み込み' : 'さらに読み込む')}</button>}
    </div>
    {deleteTarget && <DeleteDeckDialog key={deleteTarget.id} deck={deleteTarget} userId={userId} onClose={() => setDeleteTarget(null)} onDeleted={() => {
      removeDeck(deleteTarget.id);
      setDeleteTarget(null);
      setNotice(t('デッキを削除しました'));
    }} />}
  </section>;
}

function CopyDeckLinkButton({ deck, userId, onCopyStart }: { deck: SavedDeckSummary; userId: string; onCopyStart: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status !== 'copied' && status !== 'failed') return;
    const timer = window.setTimeout(() => setStatus('idle'), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    if (status === 'copying') return;
    onCopyStart();
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/deck/${userId}/${deck.id}`);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  const label = t(status === 'copied' ? 'コピーしました' : status === 'failed' ? 'コピーできませんでした' : status === 'copying' ? 'コピー中...' : '共有リンクをコピー');
  return <button type="button" onClick={() => void copy()} disabled={status === 'copying'}
    aria-label={`${deck.name || t('無名のデッキ')}: ${label}`}
    className={`${button({ variant: 'ghost', size: 'sm' })} ${css({ minW: '10rem' })} ${status === 'copied'
      ? css({ color: 'green.700', bg: 'green.50', _dark: { color: 'green.300', bg: 'green.900' } })
      : status === 'failed' ? css({ color: 'red.700', bg: 'red.50', _dark: { color: 'red.300', bg: 'red.900' } }) : ''}`}>
    <span aria-live="polite">{label}</span>
  </button>;
}

function DeleteDeckDialog({ deck, userId, onClose, onDeleted }: { deck: SavedDeckSummary; userId: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function remove() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(false);
    try {
      await deleteDoc(doc(db, 'users', userId, 'decks', deck.id));
      onDeleted();
    } catch (problem) {
      console.error('デッキの削除に失敗しました:', problem);
      setError(true);
      setIsDeleting(false);
    }
  }

  return <dialog ref={dialog} aria-labelledby="delete-deck-title" onCancel={event => { event.preventDefault(); if (!isDeleting) onClose(); }} className={css({
    w: 'calc(100% - 32px)', maxW: 'sm', m: 'auto', rounded: 'lg', bg: 'white', p: '6', color: 'gray.900', boxShadow: 'xl',
    _dark: { bg: 'gray.800', color: 'gray.100' }, _backdrop: { bg: 'black/50' },
  })}>
    <h3 id="delete-deck-title" className={css({ mb: '4', fontSize: 'lg', fontWeight: 'bold' })}>{t('デッキの削除')}</h3>
    <p className={css({ mb: '2', fontWeight: 'medium', overflowWrap: 'anywhere' })}>{deck.name || t('無名のデッキ')}</p>
    <p className={css({ mb: '6', fontSize: 'sm', color: 'gray.600', _dark: { color: 'gray.300' } })}>{t('このデッキを削除してもよろしいですか？この操作は取り消せません。')}</p>
    {error && <p role="alert" className={css({ mb: '4', color: 'red.600', _dark: { color: 'red.300' } })}>{t('デッキを削除できませんでした')}</p>}
    <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '3' })}>
      <button type="button" autoFocus disabled={isDeleting} onClick={onClose} className={button({ variant: 'outline', size: 'md' })}>{t('キャンセル')}</button>
      <button type="button" disabled={isDeleting} onClick={() => void remove()} className={button({ variant: 'danger', size: 'md' })}>{t(isDeleting ? '削除中...' : '削除する')}</button>
    </div>
  </dialog>;
}
