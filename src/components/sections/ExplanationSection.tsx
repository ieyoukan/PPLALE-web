import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { homeFont } from './homeFont';
import { css } from 'styled-system/css';

// 解説カード情報
const explanationCards = [
  {
    title: 'ぷぷりえーるとは',
    description: '「お菓子争奪戦争ぷぷりえーる」は、VRChatから生まれた幼女とお菓子のカードゲーム。2つのデッキからカードを引き、PPを使って、相手のお菓子を先に0にしたら勝ち！ブラウザではCPU対戦やルーム対戦も楽しめます。',
    img: '/images/fruits/いちご.webp',
    rules: true,
  },
  {
    title: 'ぷぷりえとは',
    description: '「ロリっ子喫茶ぷぷりえ」は、VRChatで開催されている交流イベント。ぷぷりえの店員さんたちが、ぷぷりえーるのカードになって登場するよ！',
    img: 'https://pple.vr2.info/_assets/GI2XJgG18B_DTXqu.webp',
    link: 'https://pple.vr2.info/'
  }
];

export default function ExplanationSection() {
  return (
    <section aria-labelledby="game-introduction-heading" className={css({ position: 'relative', minH: 'screen', w: 'full' })}>
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

      <div
        className={css({ position: 'relative', zIndex: '10', w: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', py: '20', px: '4' })}
      >
        <div className={css({ w: 'full', maxW: '6xl' })}>
          <h2
            id="game-introduction-heading"
            className={`${homeFont.className} ${css({ fontSize: '4xl', md: { fontSize: '5xl' }, textAlign: 'center', mb: '20', color: 'white' })}`}
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
          </h2>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '10', mb: '10', mt: '10', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16' } })}>
            {explanationCards.map((card) => (
              <div
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
              >
                <div className={css({ display: 'flex', flexDirection: 'column', h: 'full' })}>
                  <h3 className={`${homeFont.className} ${css({ fontSize: '2xl', md: { fontSize: '3xl' }, mb: '4', color: 'pink.400' })}`}>
                    {card.title}
                  </h3>

                  <div className={css({ mb: '6', flexGrow: '1' })}>
                    <p className={css({ fontSize: 'lg', lineHeight: 'relaxed' })}>
                      {card.description}
                    </p>
                    {card.rules && (
                      <Link href="/about" className={css({
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: '3', minH: '12', mt: '6', px: '6', py: '3',
                        bg: 'pink.100', color: 'pink.800', rounded: 'xl', fontSize: 'lg', fontWeight: 'bold',
                        _hover: { bg: 'pink.200' },
                        _focusVisible: { outline: '3px solid', outlineColor: 'pink.500', outlineOffset: '3px' },
                      })}>
                        ルール・あそびかた <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </div>

                  <div className={`group ${css({ position: 'relative', h: '64', rounded: 'xl', overflow: 'hidden' })}`}>
                    <Image
                      src={card.img}
                      alt={card.title}
                      fill
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      style={{ objectFit: 'cover' }}
                    />
                    {card.link && (
                      <a href={card.link} target="_blank" rel="noopener noreferrer" aria-label="ロリっ子喫茶ぷぷりえの公式ホームページ" className={css({ position: 'absolute', inset: '0', bg: 'black/0', transitionProperty: 'all', transitionDuration: '300ms', display: 'flex', alignItems: 'center', justifyContent: 'center', rounded: 'xl', _groupHover: { bg: 'black/60' } })}>
                        <span className={css({ color: 'white', fontWeight: 'bold', fontSize: 'lg', opacity: '0', transitionProperty: 'opacity', transitionDuration: '300ms', _groupHover: { opacity: '1' } })}>
                          公式ホームページへ →
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
