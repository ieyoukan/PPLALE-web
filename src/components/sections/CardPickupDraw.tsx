'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Card from '@/components/card/Card';
import { allSweetCards, allYojoCards } from '@/data/cards';
import type { CardInfo } from '@/types/card';
import { css } from 'styled-system/css';

function randomItem(cards: CardInfo[]): CardInfo {
  return cards[Math.floor(Math.random() * cards.length)];
}

export function createPickup(): CardInfo[] {
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

export default function CardPickupDraw({ pickupCards, drawRound }: { pickupCards: CardInfo[]; drawRound: number }) {
  const reduceMotion = useReducedMotion();
  const baseCardWidth = pickupCards.length === 3 ? 102 : 82;
  const baseCardHeight = Math.round(baseCardWidth * 1.5);
  const smallCardWidth = pickupCards.length === 3 ? 150 : 140;
  const smallCardHeight = Math.round(smallCardWidth * 1.5);

  return (
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
  );
}
