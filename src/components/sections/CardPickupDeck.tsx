'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { CardInfo } from '@/types/card';
import { css } from 'styled-system/css';
import styles from './CardPickupDeck.module.css';

const DrawnCards = dynamic(() => import('./CardPickupDraw'));

/** Keep the unopened deck light; load cards, validation and their spring animation on a tap. */
export default function CardPickupDeck() {
  const [pickupCards, setPickupCards] = useState<CardInfo[]>([]);
  const [drawRound, setDrawRound] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const isOpened = pickupCards.length > 0;
  const handleDraw = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDrawing(true);
    setError('');
    try {
      const { createPickup } = await import('./CardPickupDraw');
      setPickupCards(createPickup());
      setDrawRound(round => round + 1);
    } catch {
      setError('カードを読み込めませんでした。もう一度お試しください');
    } finally { inFlight.current = false; setDrawing(false); }
  };
  return (
    <>
        <figure
          className={`${styles.deck} ${css({
            position: 'relative',
            display: 'block',
            w: { base: '40', sm: '48', md: '60' },
            aspectRatio: '2 / 3',
            mx: 'auto',
            transformStyle: 'preserve-3d',
          })}`}
          style={{ perspective: '900px' }}
        >
          <span data-pickup-glow
            className={css({
              position: 'absolute',
              inset: '-5',
              rounded: '2xl',
              borderWidth: '3px',
              borderColor: 'white/65',
              pointerEvents: 'none',
              left: '0px',
              top: '0px',
              scale: '1.15',
            })}
          />
          <button
            type="button"
            disabled={drawing}
            aria-busy={drawing}
            className={css({
              display: 'block',
              w: { base: '40', sm: '48', md: '60' },
              aspectRatio: '2 / 3',
              mx: 'auto',
              cursor: 'pointer',
              outline: 'none',
              _focusVisible: { ring: '4px', ringColor: 'var(--brand-sage)' },
            })}
            onClick={handleDraw}
            aria-label={isOpened ? '山札からカードをもう一度引く' : '山札からカードをピックアップする'}
          >
          <span
            className={css({
              position: 'absolute',
              top: '3',
              right: '-4',
              bottom: '-2',
              w: '4',
              bg: 'var(--brand-cocoa-deep)',
            })}
            style={{ clipPath: 'polygon(0 0, 100% 12px, 100% 100%, 0 calc(100% - 12px))' }}
          />
          <span
            className={css({
              position: 'absolute',
              left: '3',
              right: '-4',
              bottom: '-4',
              h: '4',
              bg: 'var(--brand-cocoa)',
            })}
            style={{ clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 100%, 16px 100%)' }}
          />
          <span
            className={css({
              position: 'absolute',
              inset: '0',
              overflow: 'hidden',
              rounded: 'lg',
              transform: 'translateZ(8px)',
            })}
          >
            <Image
              src="/images/back-card.webp"
              alt=""
              fill
              sizes="128px"
              className={css({ objectFit: 'cover' })}
            />
          </span>
          </button>
        </figure>
        {error && <p role="status">{error}</p>}
        {isOpened && <DrawnCards pickupCards={pickupCards} drawRound={drawRound} />}
    </>
  );
}
