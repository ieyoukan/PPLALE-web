'use client';

import Image from 'next/image';
import Link from 'next/link';
import styles from './ExplanationSection.module.css';
import { css } from 'styled-system/css';
import { Bi } from '@/i18n/Bi';
import { useI18n } from '@/i18n/LocaleProvider';

// 解説カード情報
const explanationCards = [
  {
    title: 'ぷぷりえーるとは',
    en: 'About PPLALE',
    enDescription: 'PPLALE (お菓子争奪戦争ぷぷりえーる) is a card game of little girls and sweets, born in VRChat. Draw cards from your two decks, spend PP, and reduce your opponent\'s sweets to 0 first to win! In the browser you can also play against the CPU or in online rooms.',
    description: '「お菓子争奪戦争ぷぷりえーる」は、VRChatから生まれた幼女とお菓子のカードゲーム。2つのデッキからカードを引き、PPを使って、相手のお菓子を先に0にしたら勝ち！ブラウザではCPU対戦やルーム対戦も楽しめます。',
    img: '/images/fruits/いちご.webp',
    rules: true,
  },
  {
    title: 'ぷぷりえとは',
    en: 'About Peuplier',
    enDescription: 'Café Peuplier (ロリっ子喫茶ぷぷりえ) is a social event held in VRChat. The staff of Peuplier appear as PPLALE cards!',
    description: '「ロリっ子喫茶ぷぷりえ」は、VRChatで開催されている交流イベント。ぷぷりえの店員さんたちが、ぷぷりえーるのカードになって登場するよ！',
    img: 'https://pple.vr2.info/_assets/GI2XJgG18B_DTXqu.webp',
    link: 'https://pple.vr2.info/'
  }
];

export default function ExplanationSection() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="game-introduction-heading" className={`${styles.section} ${css({ position: 'relative', minH: 'screen', w: 'full' })}`}>
      <div
        className={css({ position: 'relative', zIndex: '10', w: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', py: '20', px: '4' })}
      >
        <div className={css({ w: 'full', maxW: '6xl' })}>
          <div className={styles.headingWrap}>
            <h2 id="game-introduction-heading" className={styles.title}>
              <Bi ja="ゲームについて" en="About the game" />
            </h2>
          </div>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '10', mb: '10', mt: '10', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16' } })}>
            {explanationCards.map((card) => (
              <div
                key={card.title}
                className={`${css({
                  bg: 'var(--brand-paper)',
                  color: 'var(--brand-cocoa-deep)',
                  backdropBlur: 'md',
                  rounded: '2xl',
                  p: '6',
                  borderWidth: '1px',
                  borderColor: 'var(--brand-pink)',
                  transitionProperty: 'color, background-color',
                  transitionDuration: '300ms',
                })}`}
              >
                <div className={css({ display: 'flex', flexDirection: 'column', h: 'full' })}>
                  <h3 className={styles.cardTitle}>
                    <Bi ja={card.title} en={card.en} />
                  </h3>

                  <div className={css({ mb: '6', flexGrow: '1' })}>
                    <p className={css({ fontSize: 'lg', lineHeight: 'relaxed' })}>
                      <Bi ja={card.description} en={card.enDescription} />
                    </p>
                    {card.rules && (
                      <Link href="/about" prefetch={false} className={css({
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: '3', minH: '12', mt: '6', px: '6', py: '3',
                        bg: 'var(--brand-pink)', color: 'var(--brand-cocoa-deep)', rounded: 'xl', fontSize: 'lg', fontWeight: 'bold',
                        _hover: { bg: 'var(--brand-blush)' },
                        _focusVisible: { outline: '3px solid', outlineColor: 'var(--brand-cocoa)', outlineOffset: '3px' },
                      })}>
                        <Bi ja="ルール・あそびかた" en="Rules and how to play" /> <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </div>

                  <div className={`group ${css({ position: 'relative', h: '64', rounded: 'xl', overflow: 'hidden' })}`}>
                    <Image
                      src={card.img}
                      alt={t(card.title)}
                      fill
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      style={{ objectFit: 'cover' }}
                    />
                    {card.link && (
                      <a href={card.link} target="_blank" rel="noopener noreferrer" aria-label={t('ロリっ子喫茶ぷぷりえの公式ホームページ')} className={css({ position: 'absolute', inset: '0', bg: 'black/0', transitionProperty: 'all', transitionDuration: '300ms', display: 'flex', alignItems: 'center', justifyContent: 'center', rounded: 'xl', _groupHover: { bg: 'black/60' } })}>
                        <span className={css({ color: 'white', fontWeight: 'bold', fontSize: 'lg', opacity: '0', transitionProperty: 'opacity', transitionDuration: '300ms', _groupHover: { opacity: '1' } })}>
                          <Bi ja="公式ホームページへ" en="Official website" /> →
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
