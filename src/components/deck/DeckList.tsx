'use client';

import React from 'react';
import { CardInfo } from '@/types/card';
import Deck from '@/components/deck/Deck';
import { css } from 'styled-system/css';

/**
 * @JSDoc
 * @description DeckListコンポーネントのProps
 * @property {CardInfo[]} yojoDeck - 幼女デッキのカードリスト
 * @property {CardInfo[]} sweetDeck - お菓子デッキのカードリスト
 * @property {CardInfo | null} playableCard - 選択されているプレイアブルカード
 * @property {boolean} isOwner - デッキのオーナーであるかどうか
 * @property {'yojo' | 'sweet' | 'playable'} activeTabKey - 現在表示すべきデッキの種類を示すキー
 * @property {(card: CardInfo) => void} onRemoveFromYojoDeck - 幼女デッキからカードを削除するコールバック
 * @property {(card: CardInfo) => void} onRemoveFromSweetDeck - お菓子デッキからカードを削除するコールバック
 * @property {() => void} onRemovePlayableCard - プレイアブルカードを削除するコールバック
 * @property {(e: React.DragEvent, deckType: string) => void} onDropDeck - カードがドロップされたときのコールバック
 */
interface DeckListProps {
  yojoDeck: CardInfo[];
  sweetDeck: CardInfo[];
  playableCard: CardInfo | null;
  isOwner: boolean;
  activeTabKey: 'yojo' | 'sweet' | 'playable';
  onRemoveFromYojoDeck: (card: CardInfo) => void;
  onRemoveFromSweetDeck: (card: CardInfo) => void;
  onRemovePlayableCard: () => void;
  onDropDeck: (e: React.DragEvent, deckType: string) => void;
  onAddClick?: (type: string) => void;
}

/**
 * @JSDoc
 * @description デッキに登録されたカードを表示し、操作するためのコンポーネント。
 * 表示するカードの種類（幼女、お菓子、プレイアブル）は `activeTabKey` props によって制御される。
 * @param {DeckListProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} DeckListコンポーネント
 */
const DeckList: React.FC<DeckListProps> = ({
  yojoDeck,
  sweetDeck,
  playableCard,
  isOwner,
  activeTabKey,
  onRemoveFromYojoDeck,
  onRemoveFromSweetDeck,
  onRemovePlayableCard,
  onDropDeck,
  onAddClick,
}) => {
  return (
    <div>
      {isOwner ? (
        <>

          {/* 選択されたタブに応じたデッキを表示（オーナーの場合） */}
          {activeTabKey === 'yojo' && (
            <Deck
              cards={yojoDeck}
              type="yojo"
              readOnly={false}
              onCardRemove={onRemoveFromYojoDeck}
              onDragOverDeck={(e) => e.preventDefault()}
              onDragLeaveDeck={() => {}}
              onDropDeck={(e) => onDropDeck(e, 'yojo')}
              onAddClick={onAddClick}
              attachedToTabs
            />
          )}

          {activeTabKey === 'sweet' && (
            <Deck
              cards={sweetDeck}
              type="sweet"
              readOnly={false}
              onCardRemove={onRemoveFromSweetDeck}
              onDragOverDeck={(e) => e.preventDefault()}
              onDragLeaveDeck={() => {}}
              onDropDeck={(e) => onDropDeck(e, 'sweet')}
              onAddClick={onAddClick}
              attachedToTabs
            />
          )}

          {activeTabKey === 'playable' && (
            <Deck
              cards={[playableCard || null].filter(Boolean) as CardInfo[]}
              type="playable"
              readOnly={false}
              onCardRemove={onRemovePlayableCard}
              onDragOverDeck={(e) => e.preventDefault()}
              onDragLeaveDeck={() => {}}
              onDropDeck={(e) => onDropDeck(e, 'playable')}
              onAddClick={onAddClick}
              attachedToTabs
            />
          )}
        </>
      ) : (
        <>
          {/* 3つのデッキを同時に表示（閲覧モードの場合） */}
          <div className={css({ display: 'flex', flexDirection: 'column', lg: { flexDirection: 'row' }, gap: '4' })}>
            {/* 左側：幼女デッキ */}
            <div className={css({ w: 'full', lg: { w: '1/2' } })}>
              <Deck
                cards={yojoDeck}
                type="yojo"
                readOnly={true}
                onCardRemove={onRemoveFromYojoDeck} // 実際には呼ばれないが型合わせのため
                showDuplicates={false}
              />
            </div>

            {/* 右側：お菓子デッキとプレイアブルカード */}
            <div className={css({ display: 'flex', flexDirection: 'column', gap: '4', w: 'full', lg: { w: '1/2' } })}>
              <Deck
                cards={sweetDeck}
                type="sweet"
                readOnly={true}
                onCardRemove={onRemoveFromSweetDeck} // 実際には呼ばれないが型合わせのため
                showDuplicates={false}
              />

              <Deck
                cards={[playableCard || null].filter(Boolean) as CardInfo[]}
                type="playable"
                readOnly={true}
                onCardRemove={onRemovePlayableCard} // 実際には呼ばれないが型合わせのため
                showDuplicates={false}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DeckList;
