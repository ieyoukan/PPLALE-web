'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { homeTitleFont } from './homeFont';
import { css } from 'styled-system/css';
import styles from './HeroSection.module.css';

const cardButtons = [
  { title: 'ぷぷりえーるとは', lines: ['ぷぷりえーる', 'とは'], href: '/about', img: '/images/back-card.webp' },
  { title: 'ゲームをプレイ', lines: ['ゲームを', 'プレイ'], href: '/game', img: '/images/back-card.webp' },
  { title: 'デッキをつくる', lines: ['デッキを', 'つくる'], href: '/build', img: '/images/back-card.webp' },
];

/** 画面外で配り終わらないよう、最初に見えたときに一度だけ配る。 */
export function HeroCardNavigation() {
  const navigation = useRef<HTMLElement>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const element = navigation.current!;
    const bounds = element.getBoundingClientRect();
    const visibleHeight = Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0));
    if (visibleHeight >= bounds.height * .15) return;
    setWaiting(true);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .15)) {
        setWaiting(false);
        observer.disconnect();
      }
    }, { threshold: .15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <nav
      ref={navigation} aria-label="メニュー" data-hero-navigation data-deal-state={waiting ? 'waiting' : 'playing'}
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
          <Link href={btn.href} prefetch={false} aria-label={btn.title} className={`${styles.cardLink} ${css({
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
              {btn.lines.map(line => <span key={line}>{line}</span>)}
            </span>
          </Link>
        </div>
      ))}
    </nav>
  );
}
