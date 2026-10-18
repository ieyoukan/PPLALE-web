'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';

const darumadrop = Darumadrop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

const cardButtons = [
  { title: 'ぷぷりえーるとは', lines: ['ぷぷりえーる', 'とは'], href: '/about', img: '/images/back-card.webp' },
  { title: 'ゲームをプレイ', lines: ['ゲームを', 'プレイ'], href: '/game', img: '/images/back-card.webp' },
  { title: 'デッキをつくる', lines: ['デッキを', 'つくる'], href: '/build', img: '/images/back-card.webp' },
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
    y: -200,
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

export default function HeroSection() {
  return (
    <section aria-label="ぷぷりえーるを遊ぶ" className={css({ position: 'relative', minH: '100svh' })}>
      <div className={css({ position: 'absolute', inset: '0' })}>
        <Image
          src="/top.jpg"
          alt=""
          fill
          preload
          sizes="100vw"
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAJABADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAID/8QAJRAAAAQFAgcAAAAAAAAAAAAAAQIDBAAFERIxBiE0NVFyc7HB/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAWEQEBAQAAAAAAAAAAAAAAAAABADH/2gAMAwEAAhEDEQA/AMZaxlzpVJM6NXIBcclRpkMxc8I2YLWpJ2uA3IXcSFKPQMYgel+dJdpvUM1jxyHi+xZsLf/Z"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
        <div className={css({ position: 'absolute', inset: '0' })}></div>
      </div>

      <div className={css({
        position: 'relative', zIndex: '10', minH: '100svh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '6', pt: '20', pb: '12', px: '4', md: { gap: '8' },
      })}>
        <motion.h1
          className={css({ w: '80vw', maxW: '400px' })}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <Image src="/pupu_game.webp" alt="お菓子争奪戦争ぷぷりえーる" width={500} height={281}
            className={css({ w: 'full', h: 'auto' })} sizes="(max-width: 500px) 80vw, 400px" preload />
        </motion.h1>

        <p className={css({
          maxW: 'lg', px: '5', py: '3', rounded: '2xl', bg: 'white/90',
          color: 'pink.900', textAlign: 'center', fontSize: 'sm', lineHeight: 'relaxed',
          boxShadow: 'sm', md: { fontSize: 'base' },
        })}>
          VRChatから生まれた、幼女とお菓子のカードゲーム。<br />
          ルールを知って、推しといっしょに遊ぼう！
        </p>

        <motion.nav
          aria-label="メニュー"
          className={css({
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            w: 'full', maxW: '640px', gap: '2.5', md: { gap: '6' },
          })}
          variants={containerVariants} initial={false} animate="visible"
        >
          {cardButtons.map((btn) => (
            <motion.div
              key={btn.href}
              variants={cardVariants}
              whileHover={{ y: -12, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.95 }}
              className={css({ minW: '0', position: 'relative' })}
            >
              <Link href={btn.href} aria-label={btn.title} className={css({
                display: 'block', position: 'relative', aspectRatio: '220 / 320',
                rounded: 'xl', boxShadow: '0 12px 24px rgba(45, 20, 45, 0.35)',
                _focusVisible: { outline: '3px solid white', outlineOffset: '6px' },
              })}>
                <Image src={btn.img} alt="" fill sizes="(max-width: 640px) 32vw, 260px"
                  style={{ objectFit: 'cover', borderRadius: '0.75rem' }} preload />
                <span aria-hidden="true" className={`${darumadrop.className} ${css({
                  position: 'absolute', inset: '0', zIndex: '10',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  bg: 'black/30', rounded: 'xl', fontWeight: 'bold',
                  fontSize: 'clamp(15px, 4.2vw, 30px)', color: 'white', px: '1', textAlign: 'center',
                  lineHeight: '1.4', textShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
                })}`}>
                  {btn.lines.map(line => <span key={line}>{line}</span>)}
                </span>
              </Link>
            </motion.div>
          ))}
        </motion.nav>
      </div>
    </section>
  );
}
