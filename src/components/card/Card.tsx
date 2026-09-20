/**
 * カードコンポーネント
 * 
 * カードの表示と操作を行うコンポーネント
 * カードの種類（幼女/お菓子）に応じて表示を変更する
 */

'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { CardInfo } from '@/types/card';
import CardDetail from './CardDetail';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/PPLALE-web_front' : '';

interface CardSize {
  width: number;
  height: number;
}

interface CardSizes {
  base: CardSize;
  sm: CardSize;
  md: CardSize;
  lg: CardSize;
}

interface CardProps {
  /** 表示するカードのデータ */
  card: CardInfo;
  /** カードが選択されているかどうか */
  isSelected?: boolean;
  /** カードがクリックされたときのコールバック関数 */
  onClick?: (card: CardInfo) => void;
  /** カードがドラッグ可能かどうか */
  draggable?: boolean;
  /** ドラッグ開始時のコールバック関数 */
  onDragStart?: (e: React.DragEvent, card: CardInfo) => void;
  /** カードの重複数 */
  count?: number;
  /** カードのサイズ設定 */
  sizes?: {
    base: { width: number; height: number };
    sm: { width: number; height: number };
    md: { width: number; height: number };
    lg: { width: number; height: number };
  };
  /** カードが削除されたときのコールバック関数 */
  onRemove?: (card: CardInfo) => void;
  /** 削除ボタンを表示するかどうか */
  showRemoveButton?: boolean;
  /** デッキに追加するコールバック関数 */
  onAddToDeck?: (card: CardInfo) => void;
  /** デッキに追加できるかどうか */
  canAddToDeck?: (card: CardInfo) => boolean;
  /**デッキに追加されているかどうか */
  isInDeck?: boolean;
  /** カードの詳細を表示できるか */
  canShowDetail?: boolean;
  /** カードが表向きかどうか (true: 表, false: 裏) */
  isFaceUp?: boolean;
  /** LCP最適化用: 最初の画面に見えるカードに指定すると優先読み込みされる */
  priority?: boolean;
  /** 最適化APIを介さず原寸画像を使う（拡大表示など、先読み済み画像向け） */
  unoptimized?: boolean;
}

const defaultSizes: CardSizes = {
  base: { width: 100, height: 151 },
  sm: { width: 100, height: 151 },
  md: { width: 130, height: 195 },
  lg: { width: 130, height: 195 }
};

/**
 * カードコンポーネント
 * 
 * @param card 表示するカードのデータ
 * @param isSelected カードが選択されているかどうか
 * @param onClick カードがクリックされたときのコールバック関数
 * @param draggable カードがドラッグ可能かどうか
 * @param onDragStart ドラッグ開始時のコールバック関数
 * @param count カードの重複数
 * @param sizes カードのサイズ設定
 * @param onRemove カードが削除されたときのコールバック関数
 * @param showRemoveButton 削除ボタンを表示するかどうか
 * @param onAddToDeck デッキに追加するコールバック関数
 * @param canAddToDeck デッキに追加できるかどうか
 * @param isInDeck デッキに追加されているかどうか
 * @param canShowDetail カードの詳細を表示できるか
 * @param isFaceUp カードが表向きかどうか (デフォルトは true)
 * @returns カードコンポーネント
 */
const Card: React.FC<CardProps> = ({
  card,
  isSelected = false,
  onClick,
  draggable = false,
  onDragStart,
  count = 1,
  sizes,
  onRemove,
  showRemoveButton = false,
  onAddToDeck,
  canAddToDeck,
  isInDeck = false,
  canShowDetail = true,
  isFaceUp = true,
  priority = false,
  unoptimized = false,
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const { locale, t } = useI18n();

    // サイズ設定をマージ
    const cardSizes: CardSizes = {
      base: { ...defaultSizes.base, ...sizes?.base },
      sm: { ...defaultSizes.sm, ...sizes?.sm },
      md: { ...defaultSizes.md, ...sizes?.md },
      lg: { ...defaultSizes.lg, ...sizes?.lg }
    };

  const imagePath = `${basePath}${card.imageUrl}`;
  const loadingImagePath = `${basePath}/images/back-card.webp`;

  // カードがクリックされたときの処理
  const handleClick = () => {
    if (canShowDetail && isFaceUp) {
      setShowDetail(true);
    } else if (onClick) {
      onClick(card);
    }
  };

  const preloadDetailImage = () => {
    if (!canShowDetail || !isFaceUp) return;
    const image = new window.Image();
    image.src = imagePath;
  };

  // ドラッグ開始時の処理
  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart && !showDetail) {
      onDragStart(e, card);
    }
  };

  // カードが削除されたときの処理
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(card);
    }
  };

  return (
    <>
      <div
        className={`card-container ${css({
          position: 'relative',
          rounded: 'lg',
          overflow: 'hidden',
          w: 'full',
          h: 'full',
          flexShrink: '0',
          cursor: (canShowDetail && isFaceUp) || onClick ? 'pointer' : undefined,
          pointerEvents: showDetail ? 'none' : undefined,
        })}`}
        style={{
          width: `${cardSizes.base.width}px`,
          height: `${cardSizes.base.height}px`,
          perspective: '1000px', 
        }}
        onClick={handleClick}
        onPointerEnter={preloadDetailImage}
        onTouchStart={preloadDetailImage}
        draggable={draggable && !showDetail && isFaceUp}
        onDragStart={handleDragStart}
      >
        <style jsx>{`
          .card-container {
            width: ${cardSizes.base.width}px;
            height: ${cardSizes.base.height}px;
          }
          @media (min-width: 640px) {
            .card-container {
              width: ${cardSizes.sm.width}px !important;
              height: ${cardSizes.sm.height}px !important;
            }
          }
          @media (min-width: 768px) {
            .card-container {
              width: ${cardSizes.md.width}px !important;
              height: ${cardSizes.md.height}px !important;
            }
          }
          @media (min-width: 1024px) {
            .card-container {
              width: ${cardSizes.lg.width}px !important;
              height: ${cardSizes.lg.height}px !important;
            }
          }
          .card-flip-inner {
            position: relative;
            width: 100%;
            height: 100%;
            transition: transform 1s cubic-bezier(0.3, 0.0, 0.5, 1);
            transform-style: preserve-3d;
          }
          .card-face {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden; /* Safari and Chrome */
            border-radius: inherit; 
            overflow: hidden; 
          }
          .card-back {
            transform: rotateY(180deg);
          }
        `}</style>
        
        <div
          className="card-flip-inner"
          style={{
            transform: isFaceUp ? 'rotateY(0deg)' : 'rotateY(180deg)',
          }}
        >
          {/* 表側のコンテンツ */}
          <div className="card-face card-front">
            <Image
              src={imagePath}
              alt={card.name}
              fill
              className={css({ rounded: 'lg', objectFit: 'contain' })}
              sizes={`(max-width: 640px) ${cardSizes.base.width}px, 
                     (max-width: 768px) ${cardSizes.sm.width}px, 
                     (max-width: 1024px) ${cardSizes.md.width}px, 
                     ${cardSizes.lg.width}px`}
              priority={priority}
              unoptimized={unoptimized}
              placeholder="blur"
              loading={priority ? undefined : 'lazy'}
              blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGwAZQAgAEkAbgBjAC4AIAAyADAAMQA2/9sAQwAUDg8SDw0UEhASFxUUTHx+Hh4eGhodJC0lICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoICQoIP/YAERCAAoACgMBIgACEQEDEQH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAJ0AGZf/2Q=="
            />
          </div>

          {/* 裏側のコンテンツ */}
          <div className="card-face card-back">
            <Image
              src={loadingImagePath}
              alt={t('カード裏面')}
              fill
              className={css({ rounded: 'lg', objectFit: 'contain' })}
              sizes={`(max-width: 640px) ${cardSizes.base.width}px, 
                     (max-width: 768px) ${cardSizes.sm.width}px, 
                     (max-width: 1024px) ${cardSizes.md.width}px, 
                     ${cardSizes.lg.width}px`}
              priority={false}
              unoptimized={false}
            />
          </div>
        </div>

        {/* 選択中のオーバーレイ */}
        {isSelected && card.type === 'playable' && !showDetail && isFaceUp && (
          <div className={css({ position: 'absolute', inset: '0', bg: 'black/50', display: 'flex', alignItems: 'center', justifyContent: 'center', rounded: 'lg' })}>
            <p className={css({ color: 'white', fontSize: 'lg', fontWeight: 'bold' })}>{locale === 'ja' ? '選択中' : 'Selected'}</p>
          </div>
        )}

        {/* 重複数の表示 */}
        {count > 1 && !showDetail && isFaceUp && (
          <div className={css({ position: 'absolute', bottom: '2', left: '2', bg: 'black/50', color: 'white', rounded: 'full', w: '6', h: '6', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
            ×{count}
          </div>
        )}

        {/* 削除ボタン */}
        {showRemoveButton && !showDetail && isFaceUp && (
          <button
            className={css({
              position: 'absolute',
              top: '1',
              right: '1',
              bg: 'gray.300',
              color: 'gray.700',
              rounded: 'full',
              w: '6',
              h: '6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'sm',
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
              transitionDuration: '200ms',
              _hover: { bg: 'red.500', color: 'white' },
            })}
            onClick={handleRemove}
            aria-label={locale === 'ja' ? `${card.name}を削除` : `Remove ${card.name}`}
          >
            ×
          </button>
        )}
      </div>

      {/* カードの詳細 */}
      {showDetail && canShowDetail && isFaceUp && (
        <CardDetail
          card={card}
          onClose={() => setShowDetail(false)}
          onAddToDeck={(card) => {
            if (onAddToDeck) {
              onAddToDeck(card);
              setShowDetail(false);
            }
          }}
          canAddToDeck={typeof canAddToDeck === 'function' ? (card) => canAddToDeck(card) : undefined}
          isInDeck={isInDeck}
          handleCardRemove={() => onRemove?.(card)}
        />
      )}
    </>
  );
};

export default React.memo(Card);
