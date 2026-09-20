'use client';

import React from 'react';
import { motion, MotionValue } from 'framer-motion';
import Image from 'next/image';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';

const darumadrop = Darumadrop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

// 解説カード情報
const explanationCards = [
  {
    title: 'ぷぷりえーるとは',
    description: 'ぷぷりえの幼女とお菓子のカードゲーム。20枚の幼女カードと10枚のお菓子カードでデッキを構築し対戦します。ぷぷりえポイント(PP)を使用してカードを使って、先に相手のお菓子(HP)を食べた方が勝ちです。',
    img: '/images/fruits/いちご.webp'
  },
  {
    title: 'ぷぷりえとは',
    description: 'ロリっ子喫茶ぷぷりえはロリっ子とロリ好きのための交流がメインの店舗型イベント。可愛い声で接客してくれるよ！VRChatで開催されているイベントです。そしてそして！店員さんを使ってたたかえるカードゲームがぷぷりえーるなの！',
    img: 'https://pple.vr2.info/_assets/GI2XJgG18B_DTXqu.webp',
    link: 'https://pple.vr2.info/'
  }
];

// 解説カードアニメーション
const explanationVariants = {
  hidden: {
    opacity: 0,
    y: 100
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 50,
      damping: 20
    }
  }
};

interface ExplanationSectionProps {
  explanationOpacity: MotionValue<number>;
  explanationY: MotionValue<number>;
}

export default function ExplanationSection({ explanationOpacity, explanationY }: ExplanationSectionProps) {
  return (
    <section className={css({ position: 'relative', minH: 'screen', w: 'full' })}>
      {/* 解説セクションの背景 - チェック柄をリピート */}
      <div
        className={css({ position: 'absolute', inset: '0' })}
        style={{
          backgroundImage: 'url("/images/check-pattern.png")',
          backgroundRepeat: 'repeat',
          backgroundSize: '100px 100px'
        }}
      >
        {/* 背景オーバーレイ */}
        <div className={css({ position: 'absolute', inset: '0', bg: 'black/10' })}></div>
      </div>

      <motion.div
        className={css({ position: 'relative', zIndex: '10', w: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', py: '20', px: '4' })}
        style={{
          opacity: explanationOpacity,
          y: explanationY
        }}
      >
        <div className={css({ w: 'full', maxW: '6xl' })}>
          <motion.h2
            className={`${darumadrop.className} ${css({ fontSize: '4xl', md: { fontSize: '5xl' }, textAlign: 'center', mb: '20', color: 'white' })}`}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            style={{
              background: 'linear-gradient(to top,rgba(255, 255, 255, 1),rgba(255, 234, 243, 1))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextStroke: '3px pink'
            }}
          >
            ゲームについて
          </motion.h2>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '10', mb: '10', mt: '10', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16' } })}>
            {explanationCards.map((card) => (
              <motion.div
                key={card.title}
                className={`${css({
                  bg: 'yellow.200/90',
                  backdropBlur: 'md',
                  rounded: '2xl',
                  p: '6',
                  borderWidth: '1px',
                  borderColor: 'white/20',
                  transitionProperty: 'color, background-color',
                  transitionDuration: '300ms',
                })}`}
                variants={explanationVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
              >
                <div className={css({ display: 'flex', flexDirection: 'column', h: 'full' })}>
                  <h3 className={`${darumadrop.className} ${css({ fontSize: '2xl', md: { fontSize: '3xl' }, mb: '4', color: 'pink.400' })}`}>
                    {card.title}
                  </h3>

                  <div className={css({ mb: '6', flexGrow: '1' })}>
                    <p className={css({ fontSize: 'lg', lineHeight: 'relaxed' })}>
                      {card.description}
                    </p>
                  </div>

                  <div className={`group ${css({ position: 'relative', h: '64', rounded: 'xl', overflow: 'hidden', cursor: 'pointer' })}`} onClick={() => card.link && window.open(card.link, '_blank')}>
                    <Image
                      src={card.img}
                      alt={card.title}
                      fill
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      style={{ objectFit: 'cover' }}
                    />
                    {card.link && (
                      <div className={css({ position: 'absolute', inset: '0', bg: 'black/0', transitionProperty: 'all', transitionDuration: '300ms', display: 'flex', alignItems: 'center', justifyContent: 'center', rounded: 'xl', _groupHover: { bg: 'black/60' } })}>
                        <span className={css({ color: 'white', fontWeight: 'bold', fontSize: 'lg', opacity: '0', transitionProperty: 'opacity', transitionDuration: '300ms', _groupHover: { opacity: '1' } })}>
                          公式ホームページへ →
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
