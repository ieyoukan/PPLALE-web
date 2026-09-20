'use client';

import React from 'react';
import { CardInfo } from '@/types/card';
import CardList from './CardList';
import TabButtons, { TabDefinition } from '@/components/ui/TabButtons';
import { css } from 'styled-system/css';

export type DeckCardType = 'yojo' | 'sweet' | 'playable';

/** デッキ編集画面共通のタブ定義（幼女/お菓子/プレイアブル）。 */
export const DECK_VIEW_TABS: TabDefinition[] = [
  { key: 'yojo', label: 'yojo' },
  { key: 'sweet', label: 'sweet' },
  { key: 'playable', label: 'playable' },
];

function getCardListColorClassName(activeTabKey: DeckCardType) {
  return css({
    borderWidth: '1px',
    borderColor: activeTabKey === 'yojo' ? 'rose.300'
      : activeTabKey === 'sweet' ? 'cyan.300'
      : activeTabKey === 'playable' ? 'indigo.300'
      : 'gray.300',
    bg: activeTabKey === 'yojo' ? 'rose.100/80'
      : activeTabKey === 'sweet' ? 'cyan.100/80'
      : activeTabKey === 'playable' ? 'indigo.100/80'
      : 'gray.100/80',
    _dark: {
      borderColor: activeTabKey === 'yojo' ? 'rose.700'
        : activeTabKey === 'sweet' ? 'cyan.700'
        : activeTabKey === 'playable' ? 'indigo.700'
        : 'gray.700',
      bg: activeTabKey === 'yojo' ? 'rose.900/40'
        : activeTabKey === 'sweet' ? 'cyan.900/40'
        : activeTabKey === 'playable' ? 'indigo.900/40'
        : 'gray.800/60',
    },
  });
}

interface CardListPanelProps {
  allYojoCards: CardInfo[];
  allSweetCards: CardInfo[];
  allPlayableCards: CardInfo[];
  activeTabKey: DeckCardType;
  onTabClick: (key: DeckCardType) => void;
  onAddToDeck: (card: CardInfo) => void;
  canAddToDeck: (card: CardInfo) => boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, card: CardInfo) => void;
}

/**
 * 「タブ切り替え + タブに応じた配色 + カードリスト」をひとまとめにしたパネル。
 * 以前は DeckPageClient 側に配色ロジックとタブの組み立てが分散していたため、
 * このコンポーネントに集約している。
 */
export default function CardListPanel({
  allYojoCards,
  allSweetCards,
  allPlayableCards,
  activeTabKey,
  onTabClick,
  onAddToDeck,
  canAddToDeck,
  draggable = true,
  onDragStart,
}: CardListPanelProps) {
  return (
    <>
      <TabButtons
        tabs={DECK_VIEW_TABS}
        activeTabKey={activeTabKey}
        onTabClick={(key) => onTabClick(key as DeckCardType)}
        variant="cardList"
      />
      <div className={`${getCardListColorClassName(activeTabKey)} ${css({ roundedBottom: 'md', p: '2' })}`}>
        <CardList
          allYojoCards={allYojoCards}
          allSweetCards={allSweetCards}
          allPlayableCards={allPlayableCards}
          displayCardType={activeTabKey}
          onAddToDeck={onAddToDeck}
          canAddToDeck={canAddToDeck}
          draggable={draggable}
          onDragStart={onDragStart}
        />
      </div>
    </>
  );
}
