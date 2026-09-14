/**
 * カードリストコンポーネント
 *
 * 複数のカードを表示するコンポーネント。
 * フィルタリング/ソートのロジックは useCardListFilters に、
 * 絞り込みUIは CardListFilterBar に分離している。
 */

import React, { useCallback } from 'react';
import { CardInfo } from '@/types/card';
import Card from './Card';
import CardListFilterBar from './CardListFilterBar';
import { useCardListFilters } from './useCardListFilters';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

interface CardListProps {
  allYojoCards: CardInfo[];
  allSweetCards: CardInfo[];
  allPlayableCards: CardInfo[];
  displayCardType: 'yojo' | 'sweet' | 'playable'; // 外部から渡されるアクティブなタブキー
  onCardSelect?: (card: CardInfo) => void;
  selectedCardId?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, card: CardInfo) => void;
  canAddToDeck?: (card: CardInfo) => boolean;
  onAddToDeck?: (card: CardInfo) => void;
}

/**
 * カードリストとフィルタリング機能を提供するコンポーネント
 */
const CardList: React.FC<CardListProps> = ({
  allYojoCards,
  allSweetCards,
  allPlayableCards,
  displayCardType,
  onCardSelect,
  selectedCardId,
  draggable = false,
  onDragStart,
  canAddToDeck,
  onAddToDeck,
}) => {
  const { locale } = useI18n();
  const {
    fruitFilter, setFruitFilter,
    sweetTypeFilter, setSweetTypeFilter,
    versionFilter, setVersionFilter,
    searchQuery, setSearchQuery,
    sweetTypes, versions,
    sortedFilteredCards,
  } = useCardListFilters(displayCardType, allYojoCards, allSweetCards, allPlayableCards);

  const handleCardSelect = useCallback((card: CardInfo) => {
    if (onCardSelect) onCardSelect(card);
  }, [onCardSelect]);

  return (
    <div className={css({ display: 'flex', flexDirection: 'column', gap: '4' })}>
      <div className={css({ display: 'flex', flexDirection: 'column', gap: '3' })}>
        <CardListFilterBar
          displayCardType={displayCardType}
          fruitFilter={fruitFilter}
          onFruitFilterChange={setFruitFilter}
          sweetTypeFilter={sweetTypeFilter}
          onSweetTypeFilterChange={setSweetTypeFilter}
          sweetTypes={sweetTypes}
          versionFilter={versionFilter}
          onVersionFilterChange={setVersionFilter}
          versions={versions}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />
        <div className={css({
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '1',
          overflow: 'auto',
          maxH: 'calc(75vh - 50px)',
          sm: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' },
          md: { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' },
          lg: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' },
          xl: { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' },
        })}>
          {sortedFilteredCards.map((card, index) => {
            const isAddable = canAddToDeck ? canAddToDeck(card) : true;
            return (
              <div
                key={card.id}
                className={css({
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  transitionProperty: 'all',
                  opacity: !isAddable ? '40' : undefined,
                  filter: !isAddable ? 'saturate(0.5)' : undefined,
                  pointerEvents: !isAddable ? 'none' : undefined,
                })}
              >
                <Card
                  card={card}
                  isSelected={card.id === selectedCardId}
                  onClick={handleCardSelect}
                  draggable={draggable && isAddable}
                  onDragStart={onDragStart}
                  canAddToDeck={canAddToDeck}
                  onAddToDeck={onAddToDeck}
                  priority={index < 6}
                />
              </div>
            );
          })}
        </div>
      </div>

      {sortedFilteredCards.length === 0 && (
        <div className={css({ textAlign: 'center', py: '8', color: 'gray.500' })}>
          {locale === 'ja' ? '条件に一致するカードが見つかりませんでした。' : 'No cards match the selected filters.'}
        </div>
      )}
    </div>
  );
};

export default CardList;
