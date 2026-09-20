'use client';

import React, { useState } from 'react';
import { motion, MotionValue } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';
import { iconButton } from 'styled-system/recipes';

const darumadrop = Darumadrop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

const cardButtons = [
  { title: 'たいかいについて', href: '/tournament', img: '/images/back-card.webp' },
  { title: 'デッキをつくる', href: '/build', img: '/images/back-card.webp' },
  { title: 'デッキのがぞうをつくる', href: '/deck-view', img: '/images/back-card.webp' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.3,
      delayChildren: 0.6,
    }
  }
};

const cardVariants = {
  hidden: {
    y: -400,
    opacity: 0.1,
    rotateY: 100,
    rotateX: 90,
    scale: 0.8
  },
  visible: {
    y: 0,
    opacity: 1,
    rotateY: 0,
    rotateX: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 70,
      damping: 20,
      duration: 0.7
    }
  }
};

interface HeroSectionProps {
  cardsYPosition: MotionValue<string>;
}

export default function HeroSection({ cardsYPosition }: HeroSectionProps) {
  const [activeIndex, setActiveIndex] = useState(1);

  const handleNext = () => {
    setActiveIndex((prev) => Math.min(prev + 1, cardButtons.length - 1));
  };

  const handlePrev = () => {
    setActiveIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <section className={css({ position: 'relative', h: 'screen' })}>
      <div className={css({ position: 'absolute', inset: '0' })}>
        <Image
          src="/top.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAJABADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAID/8QAJRAAAAQFAgcAAAAAAAAAAAAAAQIDBAAFERIxBiE0NVFyc7HB/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAWEQEBAQAAAAAAAAAAAAAAAAABADH/2gAMAwEAAhEDEQA/AMZaxlzpVJM6NXIBcclRpkMxc8I2YLWpJ2uA3IXcSFKPQMYgel+dJdpvUM1jxyHi+xZsLf/Z"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
        <div className={css({ position: 'absolute', inset: '0' })}></div>
      </div>

      <div className={css({ position: 'relative', zIndex: '10' })}>
        <motion.div
          className={css({ w: 'full', textAlign: 'center', pt: '20', md: { pt: '28' }, lg: { pt: '32' } })}
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <Image src="/pupu_game.webp" alt="ぷぷりえーる" width={500} height={281} className={css({ position: 'absolute', left: '0', right: '0', mx: 'auto', top: '1/2' })} priority />
        </motion.div>

        <motion.div
          className={css({ position: 'absolute', left: '0', right: '0', bottom: '0', zIndex: '20', display: 'flex', justifyContent: 'flex-start', md: { justifyContent: 'center' } })}
          style={{ top: cardsYPosition }}
        >
          <div
            className={css({
              position: 'absolute', insetY: '0', left: '0', right: '0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              zIndex: '30', md: { display: 'none' }, pointerEvents: 'none', px: '2',
            })}
            style={{ top: '-10vh' }}
          >
            <button
              className={`${iconButton({ variant: 'dark', size: 'md' })} ${css({
                opacity: activeIndex === 0 ? '0' : '1',
                pointerEvents: activeIndex === 0 ? 'none' : 'auto',
                _hover: activeIndex === 0 ? undefined : { bg: 'black/50' },
              })}`}
              onClick={handlePrev} disabled={activeIndex === -1} aria-label="前のカード"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}
                className={css({ w: '8', h: '8', color: 'white', filter: 'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))' })}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              className={`${iconButton({ variant: 'dark', size: 'md' })} ${css({
                opacity: activeIndex === cardButtons.length - 1 ? '0' : '1',
                pointerEvents: activeIndex === cardButtons.length - 1 ? 'none' : 'auto',
                _hover: activeIndex === cardButtons.length - 1 ? undefined : { bg: 'black/50' },
              })}`}
              onClick={handleNext} disabled={activeIndex === cardButtons.length - 1} aria-label="次のカード"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}
                className={css({ w: '8', h: '8', color: 'white', filter: 'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))' })}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <motion.div
            className={css({
              display: 'flex', justifyContent: 'flex-start',
              transitionProperty: 'transform', transitionDuration: '500ms', transitionTimingFunction: 'ease-out',
              md: { flexWrap: 'wrap', justifyContent: 'center', gap: '8', transform: 'none!' },
              lg: { gap: '10' },
            })}
            style={{ transform: `translateX(-${activeIndex * 100}vw)` }}
            variants={containerVariants} initial="hidden" animate="visible"
          >
            {cardButtons.map((btn, idx) => (
              <div key={btn.title} className={css({
                w: '100vw', flexShrink: '0', display: 'flex', justifyContent: 'center',
                md: { w: 'auto', flexShrink: '1' },
              })}>
                <motion.div
                  variants={cardVariants} custom={idx}
                  whileHover={{ transition: { duration: 0.2, ease: "easeOut" }, y: -100 }}
                  whileTap={{ scale: 0.95 }}
                  className={css({ position: 'relative', mb: '1' })}
                >
                  <Link href={btn.href} className={css({ display: 'block' })}>
                    <div className={css({ position: 'relative' })} style={{ width: 'calc(280px + 1vw)', maxWidth: '320px', aspectRatio: '220/320' }}>
                      <div className={`${darumadrop.className} ${css({
                        position: 'absolute', inset: '0', zIndex: '10',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bg: 'black/25', rounded: '2xl', fontWeight: 'bold',
                        fontSize: { base: 'xl', sm: '2xl' }, color: 'white', p: '4', textAlign: 'center',
                        transitionProperty: 'all',
                        transform: activeIndex === idx ? 'scale(1)' : { base: 'scale(0.95)', md: 'scale(1)' },
                      })}`}>
                        {btn.title}
                      </div>
                      <Image src={btn.img} alt={btn.title} fill
                        sizes="(max-width: 640px) 85vw, (max-width: 768px) 45vw, 320px"
                        style={{ objectFit: 'cover', borderRadius: '0.5rem' }} priority={idx === activeIndex} />
                    </div>
                  </Link>
                </motion.div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
