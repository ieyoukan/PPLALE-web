/**
 * デッキコンポーネント
 *
 * デッキの表示と操作を行うコンポーネント
 * カードの追加・削除・並べ替えなどの機能を提供する
 */

import React, { useState, useMemo } from 'react';
import { CardInfo, CardType } from '@/types/card';
import Card from '@/components/card/Card';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

interface DeckProps {
  /** デッキに含まれるカードのリスト */
  cards: CardInfo[];
  /** カードが削除されたときのコールバック関数 */
  onCardRemove?: (card: CardInfo) => void;
  /** カードが並べ替えられたときのコールバック関数 */
  onCardsReorder?: (cards: CardInfo[]) => void;
  /** デッキの種類（幼女またはお菓子） */
  type: CardType;
  /** デッキを読み取り専用にするか */
  readOnly?: boolean;
  /** ソート基準 */
  defaultSortCriteria?: 'none' | 'id' | 'name' | 'cost' | 'attack' | 'hp';
  /** デッキにドラッグオーバーされたときのコールバック関数 */
  onDragOverDeck?: (e: React.DragEvent, deckType: string) => void;
  /** デッキからドラッグが離れたときのコールバック関数 */
  onDragLeaveDeck?: (e: React.DragEvent, deckType: string) => void;
  /** デッキにドロップされたときのコールバック関数 */
  onDropDeck?: (e: React.DragEvent, deckType: string) => void;
  /** 重複カードを表示するかどうか */
  showDuplicates?: boolean;
  /** スマホでカード追加ボタン（＋）が押されたときのコールバック */
  onAddClick?: (type: string) => void;
  /** スマホ表示でデッキ上部を切り替えタブへ接続するか */
  attachedToTabs?: boolean;
}

/**
 * デッキ内のカードをソートする関数
 * @param cards - ソート対象のカードリスト
 * @param criteria - ソート基準 ('none', 'id', 'name', 'cost', 'attack', 'hp')
 * @returns ソートされたカードリスト
 */
const sortCards = (cards: CardInfo[], criteria: 'none' | 'id' | 'name' | 'cost' | 'attack' | 'hp'): CardInfo[] => {
  if (criteria === 'none') {
    return cards; // ソートしない
  }
  return [...cards].sort((a, b) => {
    if (criteria === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (criteria === 'id') {
      const idA = parseInt(a.id.replace(/\D/g, ''), 10); // 数字部分を抽出
      const idB = parseInt(b.id.replace(/\D/g, ''), 10); // 数字部分を抽出
      return idA - idB;
    }
    return (a[criteria] || 0) - (b[criteria] || 0);
  });
};



/**
 * デッキコンポーネント
 * @param cards - デッキに含まれるカードのリスト
 * @param onCardRemove - カードが削除されたときのコールバック関数
 * @param onCardsReorder - カードが並べ替えられたときのコールバック関数
 * @param type - デッキの種類（幼女, お菓子, プレイアブル）
 * @param readOnly - デッキを読み取り専用にするかどうか
 * @param defaultSortCriteria - ソート基準
 * @param onDragOverDeck - デッキにドラッグオーバーされたときのコールバック関数
 * @param onDragLeaveDeck - デッキからドラッグが離れたときのコールバック関数
 * @param onDropDeck - デッキにドロップされたときのコールバック関数
 * @param showDuplicates - 重複カードを表示するかどうか
 * @returns デッキコンポーネント
 */
const Deck: React.FC<DeckProps> = ({
  cards,
  onCardRemove,
  onCardsReorder,
  type,
  readOnly = false,
  defaultSortCriteria = 'id',
  onDragOverDeck,
  onDragLeaveDeck,
  onDropDeck,
  showDuplicates = false,
  onAddClick,
  attachedToTabs = false,
}) => {
  const { t, cardTypeLabel } = useI18n();
  // ドラッグ中のカードのインデックス
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // デッキにドラッグオーバー中かどうか
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // デッキの最大枚数
  const maxCards =
        type === 'yojo'
        ? 20
        : type === 'sweet'
        ? 10
        : type === 'playable'
        ? 1
        : 0;

  // ソート基準の状態
  const [sortCriteria, setSortCriteria] = useState<'none' | 'id' | 'name' | 'cost' | 'attack' | 'hp'>(
    defaultSortCriteria
  );

  // ソートされたカードリスト
  const uniqueSortedCards = useMemo(() => {
    let baseCards = cards;
    if (showDuplicates) {
      const seen = new Set<string>();
      baseCards = [];
      for (const card of cards) {
        if (!seen.has(card.id)) {
          seen.add(card.id);
          baseCards.push(card);
        }
      }
    }
    return sortCards(baseCards, sortCriteria);
  }, [cards, sortCriteria, showDuplicates]);

  // カードごとの枚数を事前計算
  const cardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of cards) {
      counts[card.id] = (counts[card.id] || 0) + 1;
    }
    return counts;
  }, [cards]);

  // カードがドラッグ開始されたときの処理
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  // カードがドラッグオーバーされたときの処理
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // カードの並べ替え
    const newCards = [...cards];
    const draggedCard = newCards[draggedIndex];
    newCards.splice(draggedIndex, 1);
    newCards.splice(index, 0, draggedCard);

    if (onCardsReorder) {
      onCardsReorder(newCards);
    }

    setDraggedIndex(index);
  };

  // カードがドロップされたときの処理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedIndex(null);
  };

  // カードがドラッグ終了したときの処理
  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // カードが削除されたときの処理
  const handleCardRemove = (card: CardInfo) => {
    if (onCardRemove) {

      onCardRemove(card);
    }
  };

  const getDeckTheme = () => {
    if (type === 'yojo') {
      return {
        container: css({
          borderColor: 'red.200',
          bg: 'rose.100/80',
          color: 'red.900',
          _dark: { borderColor: 'red.900', bg: 'rose.900/40', color: 'rose.100' },
        }),
        title: css({ color: 'red.900', _dark: { color: 'rose.100' } }),
      };
    }

    if (type === 'sweet') {
      return {
        container: css({
          borderColor: 'cyan.200',
          bg: 'cyan.100/80',
          color: 'cyan.900',
          _dark: { borderColor: 'cyan.900', bg: 'cyan.900/30', color: 'cyan.100' },
        }),
        title: css({ color: 'cyan.900', _dark: { color: 'cyan.100' } }),
      };
    }

    if (type === 'playable') {
      return {
        container: css({
          borderColor: 'indigo.200',
          bg: 'indigo.100/80',
          color: 'indigo.900',
          _dark: { borderColor: 'indigo.900', bg: 'indigo.900/40', color: 'indigo.100' },
        }),
        title: css({ color: 'indigo.900', _dark: { color: 'indigo.100' } }),
      };
    }

    return {
      container: css({
        borderColor: 'gray.200',
        bg: 'gray.100/80',
        color: 'gray.900',
        _dark: { borderColor: 'gray.700', bg: 'gray.800/60', color: 'gray.100' },
      }),
      title: css({ color: 'gray.900', _dark: { color: 'gray.100' } }),
    };
  };

  const deckTheme = getDeckTheme();

  return (
    <div
      className={`${deckTheme.container} ${css({
        rounded: 'lg',
        borderWidth: isDraggingOver ? '4px' : '2px',
        roundedTop: attachedToTabs ? { base: 'none', lg: 'lg' } : undefined,
        borderTopWidth: attachedToTabs
          ? { base: '0', lg: isDraggingOver ? '4px' : '2px' }
          : undefined,
        borderStyle: isDraggingOver ? 'dashed' : undefined,
        p: '4',
        transitionProperty: 'all',
        transitionDuration: '200ms',
        transform: isDraggingOver ? 'scale(1.01)' : undefined,
        boxShadow: isDraggingOver ? 'lg' : undefined,
      })}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
        onDragOverDeck?.(e, type);
      }}
      onDragLeave={(e) => {
        setIsDraggingOver(false);
        onDragLeaveDeck?.(e, type);
      }}
      onDrop={(e) => {
        setIsDraggingOver(false);
        onDropDeck?.(e, type);
      }}
    >
      <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '4' })}>
        <h2 className={`${deckTheme.title} ${css({ fontSize: 'xl', fontWeight: 'bold' })}`}>
          {cardTypeLabel(type)} {t('デッキ')} ({cards.length}/{maxCards})
        </h2>
        {!readOnly && (
          <div className={css({ position: 'relative' })}>
            <select
              className={css({
                px: '1',
                py: '1',
                borderWidth: '1px',
                rounded: 'md',
                _focus: { outline: 'none', boxShadow: '0 0 0 2px #3b82f6' },
              })}
              value={sortCriteria}
              onChange={(e) => setSortCriteria(e.target.value as 'none' | 'id' | 'name' | 'cost' | 'attack' | 'hp')}
            >
              <option value="none">{t('ソートしない')}</option>
              <option value="id">{t('ID順')}</option>
              <option value="name">{t('名前順')}</option>
              <option value="cost">{t('コスト順')}</option>
              <option value="attack">{t('攻撃力順')}</option>
              <option value="hp">{t('HP順')}</option>
            </select>
          </div>
        )}
      </div>

      {/* デッキのカードリスト */}
      <div
        className={css({
          display: 'grid',
          gridTemplateColumns: readOnly
            ? type === 'yojo'
              ? {
                  base: 'repeat(4, minmax(0, 1fr))',
                  sm: 'repeat(5, minmax(0, 1fr))',
                  md: 'repeat(5, minmax(0, 1fr))',
                  lg: 'repeat(4, minmax(0, 1fr))',
                  xl: 'repeat(5, minmax(0, 1fr))',
                }
              : {
                  base: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  md: 'repeat(4, minmax(0, 1fr))',
                  lg: 'repeat(5, minmax(0, 1fr))',
                  xl: 'repeat(6, minmax(0, 1fr))',
                }
            : {
                base: 'repeat(4, minmax(0, 1fr))',
                sm: 'repeat(5, minmax(0, 1fr))',
                md: 'repeat(5, minmax(0, 1fr))',
                lg: 'repeat(4, minmax(0, 1fr))',
                xl: 'repeat(5, minmax(0, 1fr))',
              },
          gap: '2',
          overflow: 'auto',
          maxH: 'calc(80vh - 52px)',
        })}
      >
        {uniqueSortedCards.map((card, index) => (
          <div
            key={`${card.id}-${index}`}
            draggable={!readOnly}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            className={css({ position: 'relative', opacity: draggedIndex === index ? '0.5' : undefined })}
          >
            <Card
              card={card}
              draggable={!readOnly}
              count={showDuplicates ? (cardCounts[card.id] || 1) : 1}
              onRemove={!readOnly ? handleCardRemove : undefined}
              showRemoveButton={!readOnly}
            />
          </div>
        ))}
        {/* スマホ用：カード追加ボタン */}
        {!readOnly && cards.length < maxCards && (
          <button
            type="button"
            onClick={() => onAddClick && onAddClick(type)}
            className={css({
              display: { base: 'flex', lg: 'none' },
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              w: 'full',
              aspectRatio: '210/290',
              rounded: 'xl',
              borderWidth: '2px',
              borderStyle: 'dashed',
              borderColor: 'gray.400/50',
              bg: 'gray.50/50',
              _hover: { bg: 'gray.100/50' },
              _dark: { borderColor: 'gray.500/50', bg: 'gray.800/30', _hover: { bg: 'gray.700/50' } },
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
            })}
          >
            <svg className={css({ w: '10', h: '10', color: 'gray.400', mb: '2' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className={css({ fontSize: 'sm', fontWeight: 'bold', color: 'gray.500', _dark: { color: 'gray.400' } })}>{t('追加')}</span>
          </button>
        )}
      </div>

      {/* デッキが空の場合のメッセージ */}
      {cards.length === 0 && (
        <div className={css({
          display: { base: 'none', lg: 'block' },
          textAlign: 'center',
          py: '8',
          color: 'gray.500'
        })}>
          {t('デッキにカードがありません')}
        </div>
      )}
    </div>
  );
};

export default Deck;
