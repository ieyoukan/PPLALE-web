'use client';

import Link from 'next/link';
import Image from 'next/image';
import { homeTitleFont } from './homeFont';
import { css } from 'styled-system/css';
import styles from './HeroSection.module.css';
import { Bi } from '@/i18n/Bi';
import { useI18n } from '@/i18n/LocaleProvider';

const cardButtons = [
  { title: 'ぷぷりえーるとは', lines: ['ぷぷりえーる', 'とは'], en: ['About', 'PPLALE'], href: '/about', img: '/images/back-card.webp' },
  { title: 'ゲームをプレイ', lines: ['ゲームを', 'プレイ'], en: ['Play', 'the game'], href: '/game', img: '/images/back-card.webp' },
  { title: 'デッキをつくる', lines: ['デッキを', 'つくる'], en: ['Build', 'a deck'], href: '/build', img: '/images/back-card.webp' },
];

/** 山札とカードは同じCSSの時間軸で動かす。 */
export function HeroCardNavigation() {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t('メニュー')} data-hero-navigation
      className={styles.navigation}
    >
      <span className={styles.pile} aria-hidden="true" data-hero-deck>
        <i /><i /><i />
        <span className={styles.pileTop}>
          <Image src="/images/back-card.webp" alt="" fill sizes="(max-width: 640px) 32vw, 260px" loading="eager" fetchPriority="high" />
        </span>
      </span>
      {cardButtons.map((btn, index) => (
        <div
          key={btn.href}
          className={styles.card} data-hero-card={index}
        >
          <Link href={btn.href} prefetch={false} aria-label={t(btn.title)} className={`${styles.cardLink} ${css({
            display: 'block', position: 'relative', aspectRatio: '220 / 320',
            rounded: 'xl', boxShadow: '0 12px 24px rgba(45, 20, 45, 0.35)',
            _focusVisible: { outline: '3px solid var(--brand-cocoa-deep)', outlineOffset: '6px' },
          })}`}>
            <Image src={btn.img} alt="" fill sizes="(max-width: 640px) 32vw, 260px"
              style={{ objectFit: 'cover', borderRadius: '0.75rem' }} loading="eager" />
            <span aria-hidden="true" className={`${homeTitleFont.className} ${css({
              position: 'absolute', inset: '0', zIndex: '10',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              bg: 'black/30', rounded: 'xl', fontWeight: 'normal',
              fontSize: 'clamp(15px, 4.2vw, 30px)', color: 'white', px: '1', textAlign: 'center',
              lineHeight: '1.4', textShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
            })}`}>
              {btn.lines.map((line, index) => <Bi key={line} ja={line} en={btn.en[index]} />)}
            </span>
          </Link>
        </div>
      ))}
    </nav>
  );
}
