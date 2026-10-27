import { useState, useMemo, useEffect } from 'react';
import { CardInfo, CardVersion, FruitType, SweetType } from '@/types/card';

/**
 * カードリストのフィルタリング・ソートロジック。
 * CardList のUIから状態管理を分離するためのフック。
 */
export function useCardListFilters(
  displayCardType: 'yojo' | 'sweet' | 'playable',
  allYojoCards: CardInfo[],
  allSweetCards: CardInfo[],
  allPlayableCards: CardInfo[],
) {
  const [fruitFilter, setFruitFilter] = useState<FruitType | 'all'>('all');
  const [sweetTypeFilter, setSweetTypeFilter] = useState<SweetType | 'all'>('all');
  const [versionFilter, setVersionFilter] = useState<CardVersion | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 表示するカード種別が切り替わったらフィルターをリセットする
  useEffect(() => {
    setFruitFilter('all');
    setSweetTypeFilter('all');
    setVersionFilter('all');
    setSearchQuery('');
  }, [displayCardType]);

  const currentCards = useMemo(() => {
    switch (displayCardType) {
      case 'yojo': return allYojoCards;
      case 'sweet': return allSweetCards;
      case 'playable': return allPlayableCards;
      default: return [];
    }
  }, [displayCardType, allYojoCards, allSweetCards, allPlayableCards]);

  const filteredCards = useMemo(() => currentCards.filter(card => {
    if (versionFilter !== 'all' && card.version !== versionFilter) return false;
    if (displayCardType !== 'playable' && fruitFilter !== 'all' && card.fruit !== fruitFilter) return false;
    if (displayCardType === 'sweet' && sweetTypeFilter !== 'all' && card.sweetType !== sweetTypeFilter) return false;
    if (searchQuery && !card.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [currentCards, versionFilter, fruitFilter, sweetTypeFilter, searchQuery, displayCardType]);

  const sortedFilteredCards = useMemo(() => {
    return [...filteredCards].sort((a, b) => {
      if (displayCardType === 'playable') {
        const versionCompare = (a.version || '').localeCompare(b.version || '');
        if (versionCompare !== 0) return versionCompare;
      }
      const idNumA = parseInt(a.id.split('_')[1], 10);
      const idNumB = parseInt(b.id.split('_')[1], 10);
      if (isNaN(idNumA) && isNaN(idNumB)) return a.id.localeCompare(b.id);
      if (isNaN(idNumA)) return 1;
      if (isNaN(idNumB)) return -1;
      return idNumA - idNumB;
    });
  }, [filteredCards, displayCardType]);

  const sweetTypes = useMemo(
    () => Array.from(new Set(allSweetCards.flatMap(card => card.sweetType ? [card.sweetType] : []))),
    [allSweetCards],
  );
  const versions = useMemo(
    () => Array.from(new Set(allPlayableCards.flatMap(card => card.version ? [card.version] : []))),
    [allPlayableCards],
  );

  return {
    fruitFilter, setFruitFilter,
    sweetTypeFilter, setSweetTypeFilter,
    versionFilter, setVersionFilter,
    searchQuery, setSearchQuery,
    sweetTypes, versions,
    sortedFilteredCards,
  };
}
