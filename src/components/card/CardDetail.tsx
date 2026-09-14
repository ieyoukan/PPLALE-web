'use client';

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { CardInfo } from '@/types/card';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/PPLALE-web_front' : '';

interface CardDetailProps {
  card: CardInfo;
  onClose: () => void;
  canAddToDeck?: (card: CardInfo) => boolean;
  onAddToDeck?: (card: CardInfo) => void;
  handleCardRemove?: (card: CardInfo) => void;
  isInDeck: boolean;
}

const CardDetail: React.FC<CardDetailProps> = ({ card, onClose, canAddToDeck, onAddToDeck, isInDeck, handleCardRemove }) => {
  const { locale, t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = cardRef.current;
    if (!element || event.pointerType === 'touch') return;
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    element.style.transition = 'transform 80ms ease-out';
    element.style.transform = `rotateX(${y * -24}deg) rotateY(${x * 36}deg)`;
    element.style.setProperty('--shine-x', `${(x + 0.5) * 100}%`);
    element.style.setProperty('--shine-y', `${(y + 0.5) * 100}%`);
  };

  const canAdd = canAddToDeck?.(card) ?? false;

  // position: fixed の祖先が transform を持つ場合（ピックアップ演出のアニメーション用カード等）に
  // ビューポート基準の中央配置・最前面表示が崩れるため、document.body 直下にポータルで描画する
  return createPortal(
    <div
      className={css({
        position: 'fixed', inset: '0', zIndex: '50', display: 'flex', alignItems: 'center', justifyContent: 'center',
        bg: 'black/35', backdropFilter: 'blur(14px)', p: '4',
      })}
      onClick={onClose}
      onPointerMove={handlePointerMove}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={locale === 'ja' ? `${card.name}の拡大表示` : `Enlarged view of ${card.name}`}
        className={css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5' })}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={css({ position: 'relative' })}
          style={{
            width: 'min(500px, calc((100dvh - 150px) * 2 / 3), calc(100vw - 32px))',
            aspectRatio: '2 / 3',
            perspective: '1200px',
          }}
        >
          <button
            className={css({
              position: 'absolute', top: '-4', right: '-4', zIndex: '10', w: '12', h: '12', display: 'flex',
              alignItems: 'center', justifyContent: 'center', rounded: 'full', bg: 'black/75', color: 'white',
              fontSize: '4xl', lineHeight: '1', boxShadow: 'lg', transition: 'transform 150ms ease, background-color 150ms ease',
              _hover: { bg: 'black', transform: 'scale(1.08)' },
            })}
            onClick={onClose}
            aria-label={t('拡大表示を閉じる')}
          >
            ×
          </button>

          <div
            ref={cardRef}
            className={css({ position: 'absolute', inset: '0', transformStyle: 'preserve-3d', willChange: 'transform' })}
            style={{
              transform: 'rotateX(0deg) rotateY(0deg)',
              ['--shine-x' as string]: '50%',
              ['--shine-y' as string]: '50%',
            }}
          >
            <div
              className={css({
                position: 'absolute', inset: '0', overflow: 'hidden', rounded: 'lg', backfaceVisibility: 'hidden',
              })}
              style={{ transform: 'translateZ(4px)' }}
            >
              <Image
                src={`${basePath}${card.imageUrl}`}
                alt={card.name}
                fill
                sizes="(max-width: 768px) 90vw, 500px"
                className={css({ objectFit: 'contain' })}
                unoptimized
                priority
              />
              <div
                className={css({ position: 'absolute', inset: '0', pointerEvents: 'none', mixBlendMode: 'soft-light' })}
                style={{ background: 'radial-gradient(circle at var(--shine-x) var(--shine-y), rgba(255,255,255,.5), transparent 38%)' }}
              />
            </div>

            <div
              className={css({
                position: 'absolute', inset: '0', overflow: 'hidden', rounded: 'lg', backfaceVisibility: 'hidden',
              })}
              style={{ transform: 'translateZ(-4px) rotateY(180deg)' }}
            >
              <Image
                src={`${basePath}/images/back-card.webp`}
                alt={t('カード裏面')}
                fill
                sizes="(max-width: 768px) 90vw, 500px"
                className={css({ objectFit: 'contain' })}
                unoptimized
                priority
              />
            </div>
          </div>
        </div>

        {canAddToDeck && onAddToDeck ? (
          <button
            className={css({
              px: '6', py: '3', bg: 'blue.500', color: 'white', rounded: 'md', fontWeight: 'bold', boxShadow: 'md',
              _hover: { bg: 'blue.600' }, _disabled: { opacity: '0.5', cursor: 'not-allowed' },
            })}
            onClick={() => onAddToDeck(card)}
            disabled={!canAdd}
          >
            {t(card.type === 'playable' ? '選択する' : 'デッキに追加')}
          </button>
        ) : isInDeck ? (
          <button
            className={css({
              px: '6', py: '3', bg: 'red.500', color: 'white', rounded: 'md', fontWeight: 'bold', boxShadow: 'md',
              _hover: { bg: 'red.600' },
            })}
            onClick={() => handleCardRemove?.(card)}
          >
            {t('デッキから削除')}
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

export default CardDetail;
