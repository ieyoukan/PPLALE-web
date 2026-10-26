'use client';

import React from 'react';
import { CardVersion, FruitType, SweetType } from '@/types/card';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

const selectClassName = css({
  rounded: 'md',
  borderWidth: '1px',
  borderColor: 'gray.300',
  bg: 'white',
  px: '2',
  py: '1',
  fontSize: 'sm',
  color: 'gray.900',
  _dark: { borderColor: 'gray.600', bg: 'gray.900', color: 'gray.100' },
});

const inputClassName = css({
  flexGrow: '1',
  rounded: 'md',
  borderWidth: '1px',
  borderColor: 'gray.300',
  bg: 'white',
  px: '2',
  py: '1',
  fontSize: 'sm',
  color: 'gray.900',
  _dark: { borderColor: 'gray.600', bg: 'gray.900', color: 'gray.100' },
});

interface CardListFilterBarProps {
  displayCardType: 'yojo' | 'sweet' | 'playable';
  fruitFilter: FruitType | 'all';
  onFruitFilterChange: (value: FruitType | 'all') => void;
  sweetTypeFilter: SweetType | 'all';
  onSweetTypeFilterChange: (value: SweetType | 'all') => void;
  sweetTypes: SweetType[];
  versionFilter: CardVersion | 'all';
  onVersionFilterChange: (value: CardVersion | 'all') => void;
  versions: CardVersion[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}

/**
 * カードリストの絞り込みUI（フルーツ/お菓子タイプ/バージョンの選択と名前検索）。
 * CardList から表示ロジックを分離したコンポーネント。
 */
export default function CardListFilterBar({
  displayCardType,
  fruitFilter,
  onFruitFilterChange,
  sweetTypeFilter,
  onSweetTypeFilterChange,
  sweetTypes,
  versionFilter,
  onVersionFilterChange,
  versions,
  searchQuery,
  onSearchQueryChange,
}: CardListFilterBarProps) {
  const { t, fruitLabel, sweetTypeLabel, versionLabel } = useI18n();
  return (
    <div className={css({ display: 'flex', flexDirection: 'column', sm: { flexDirection: 'row' }, gap: '2' })}>
      {displayCardType === 'yojo' && (
        <select
          className={selectClassName}
          value={fruitFilter}
          onChange={(e) => onFruitFilterChange(e.target.value as FruitType | 'all')}
        >
          <option value="all">{t('すべてのフルーツ')}</option>
          {(['strawberry', 'grape', 'melon', 'orange'] as FruitType[]).map((fruit) => (
            <option key={fruit} value={fruit}>{fruitLabel(fruit)}</option>
          ))}
        </select>
      )}
      {displayCardType === 'sweet' && (
        <select
          className={selectClassName}
          value={sweetTypeFilter}
          onChange={(e) => onSweetTypeFilterChange(e.target.value as SweetType | 'all')}
        >
          <option value="all">{t('お菓子タイプ')}</option>
          {sweetTypes.map(type => (
            type && <option key={type} value={type}>{sweetTypeLabel(type)}</option>
          ))}
        </select>
      )}
      {displayCardType === 'playable' && (
        <select
          className={selectClassName}
          value={versionFilter}
          onChange={(e) => onVersionFilterChange(e.target.value as CardVersion | 'all')}
        >
          <option value="all">{t('バージョン')}</option>
          {versions.map(version => (
            version && <option key={version} value={version}>{versionLabel(version)}</option>
          ))}
        </select>
      )}
      <input
        type="text"
        placeholder={`${t('カードを検索')}...`}
        className={inputClassName}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
      />
    </div>
  );
}
