'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import Card from '@/components/card/Card';
import { allSweetCards, allYojoCards } from '@/data/cards';
import { CardInfo } from '@/types/card';
import { css } from 'styled-system/css';

function randomItem(cards: CardInfo[]): CardInfo {
  return cards[Math.floor(Math.random() * cards.length)];
}

function createPickup(): CardInfo[] {
  const count = Math.random() < 0.5 ? 3 : 4;
  const picked = [randomItem(allYojoCards), randomItem(allSweetCards)];
  const pickedIds = new Set(picked.map(card => card.id));
  const remaining = [...allYojoCards, ...allSweetCards].filter(card => !pickedIds.has(card.id));

  while (picked.length < count && remaining.length > 0) {
    const index = Math.floor(Math.random() * remaining.length);
    picked.push(remaining.splice(index, 1)[0]);
  }

  return picked
    .map(card => ({ card, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ card }) => card);
}

export default function CardPickupSection() {
  const [pickupCards, setPickupCards] = useState<CardInfo[]>(createPickup);
  const [isOpened, setIsOpened] = useState(false);
  const [drawRound, setDrawRound] = useState(0);
  const reduceMotion = useReducedMotion();

  const handleDraw = () => {
    if (isOpened) setPickupCards(createPickup());
    setDrawRound(round => round + 1);
    setIsOpened(true);
  };

  const baseCardWidth = pickupCards.length === 3 ? 102 : 82;
  const baseCardHeight = Math.round(baseCardWidth * 1.5);
  const smallCardWidth = pickupCards.length === 3 ? 150 : 140;
  const smallCardHeight = Math.round(smallCardWidth * 1.5);

  return (
    <section
      aria-labelledby="card-pickup-heading"
      className={css({
        position: 'relative',
        minH: { base: 'screen', md: '110vh' },
        w: 'full',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-start',
        pt: { base: '10', md: '14' },
        pb: { base: '24', md: '32' },
        px: '2',
      })}
    >
      <div
        aria-hidden="true"
        className={css({ position: 'absolute', inset: '0' })}
        style={{
          backgroundImage: 'url("/images/check-pattern.png")',
          backgroundRepeat: 'repeat',
          backgroundSize: '100px 100px',
        }}
      >
        <div className={css({ position: 'absolute', inset: '0', bg: 'black/10' })} />
      </div>

      <motion.div
        className={css({ position: 'relative', zIndex: '1', w: 'full', maxW: '6xl', mx: 'auto' })}
      >
        <h2
          id="card-pickup-heading"
          className={css({
            position: 'absolute',
            w: '1px',
            h: '1px',
            p: '0',
            m: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            borderWidth: '0',
          })}
        >
          カードピックアップ
        </h2>
        <figure
          className={css({
            position: 'relative',
            display: 'block',
            w: { base: '40', sm: '48', md: '60' },
            aspectRatio: '2 / 3',
            mx: 'auto',
            transformStyle: 'preserve-3d',
          })}
          style={{ perspective: '900px' }}
        >
          <motion.span
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
            animate={reduceMotion ? undefined : { opacity: [0.25, 0.85] }}
            transition={{ duration: 1.25, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          />
          <motion.button
            type="button"
            className={css({
              display: 'block',
              w: { base: '40', sm: '48', md: '60' },
              aspectRatio: '2 / 3',
              mx: 'auto',
              cursor: 'pointer',
              outline: 'none',
              _focusVisible: { ring: '4px', ringColor: 'pink.300' },
            })}
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            whileHover={reduceMotion ? undefined : { y: -8, x: -4}}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
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
              bg: '#4a2022',
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
              bg: '#351719',
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
              priority={false}
            />
          </span>
          </motion.button>
        </figure>
        {isOpened && (
          <ul
            aria-label="ピックアップしたカード"
            className={css({
              position: 'relative',
              h: { base: '40', sm: '56', md: '72', lg: '88' },
              mt: { base: '14', md: '20' },
              mx: 'auto',
              listStyleType: 'none',
              p: '0',
            })}
          >
            {pickupCards.map((card, index) => (
              <motion.li
                key={`${drawRound}-${card.id}`}
                className={css({ position: 'absolute', top: '0', cursor: 'pointer' })}
                initial={{ left: '50%', x: '-50%', y: -180, rotate: -7 + index * 4, opacity: 0, scale: 0.78 }}
                animate={{ left: `${((index + 0.5) / pickupCards.length) * 100}%`, x: '-50%', y: 0, rotate: 0, opacity: 1, scale: 1 }}
                transition={{
                  delay: reduceMotion ? 0 : index * 0.34,
                  duration: reduceMotion ? 0.01 : 0.72,
                  type: 'spring',
                  stiffness: 90,
                  damping: 17,
                }}
                whileHover={reduceMotion ? undefined : {
                  y: -14,
                  rotate: index % 2 === 0 ? -2.5 : 2.5,
                  zIndex: 5,
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Card
                  card={card}
                  sizes={{
                    base: { width: baseCardWidth, height: baseCardHeight },
                    sm: { width: smallCardWidth, height: smallCardHeight },
                    md: { width: 180, height: 270 },
                    lg: { width: 220, height: 330 },
                  }}
                  isInDeck={false}
                />
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>
    </section>
  );
}
