'use client';

import '@/app/panda.css';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { RulesHeading } from './RulesDoc';
import { RULES_ENGLISH_ID, rulesHeadingEnglish } from './RulesEnglish';
import { Bi } from '@/i18n/Bi';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './AboutPage.module.css';
import { SitePage, SitePanel } from '@/components/site/SitePage';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { VRCHAT_WORLD_URL } from '@/lib/communityLinks';
import { allSlides, clampPage, groupOf, groups } from './aboutSlides';
import type { Slide } from './aboutSlides';

// The enlarged view (and its animation library) is loaded only when a page is enlarged.
const Lightbox = dynamic(() => import('./AboutLightbox'), { ssr: false });

/** Swipes shorter than this (px) are taps. */
const SWIPE = 45;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The picture book, one page at a time. No animation library: the next page comes forward from just behind in CSS
 * (no turning: docs/design-system.md), and a swipe is read from where the pointer went down and came up.
 * Measuring the layout on the first paint (the library's drag, the strip's scrolling) forced reflows.
 */
function Book({ onZoom, paused }: { onZoom: (page: number) => void; paused: boolean }) {
  const [index, setIndex] = useState(0);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const swipeFrom = useRef<number | null>(null);
  // Whether the reader has moved from the first page (the first one is shown at once, without the page's entrance).
  const [moved, setMoved] = useState(false);
  const slide = allSlides[index];
  const activeGroup = groupOf(slide);
  const { t, locale } = useI18n();
  const titleOf = (page: Slide) => locale === 'en' ? page.en : page.title;

  const turnTo = (next: number) => { setMoved(true); setIndex(clampPage(next)); };
  const turn = (step: number) => { setMoved(true); setIndex(current => clampPage(current + step)); };

  // Keep the current page's thumbnail in view, once the reader has moved (the first page is already there).
  useEffect(() => {
    if (!moved) return;
    const strip = thumbsRef.current;
    const thumb = strip?.children[index] as HTMLElement | undefined;
    if (strip && thumb) strip.scrollTo({ left: thumb.offsetLeft - strip.clientWidth / 2 + thumb.clientWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [index, moved]);

  return (
    <>
      <nav aria-label={t('しょう')} className={styles.chips}>
        {groups.map(group => (
          <button type="button" key={group.id} data-ui-title aria-label={t('{title}を開く', { title: `${group.icon} ${locale === 'en' ? group.en : group.title}` })}
            aria-pressed={activeGroup.id === group.id} className={styles.chip}
            onClick={() => turnTo(allSlides.indexOf(group.slides[0]))}>
            <span aria-hidden="true">{group.icon}</span><Bi ja={group.title} en={group.en} />
          </button>
        ))}
      </nav>

      <section className={styles.reader} aria-label={t('ぷぷりえーるの本')} tabIndex={0}
        onKeyDown={event => {
          if (paused) return;
          if (event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
          if (event.key === 'Home') { event.preventDefault(); turnTo(0); }
          if (event.key === 'End') { event.preventDefault(); turnTo(allSlides.length - 1); }
        }}>
        <OrnateFrame size="sm" className={styles.book}>
          <div className={styles.paper}
            onPointerDown={event => { if (event.isPrimary) swipeFrom.current = event.clientX; }}
            onPointerCancel={() => { swipeFrom.current = null; }}
            onPointerUp={event => {
              const from = swipeFrom.current;
              swipeFrom.current = null;
              if (from === null) return;
              if (event.clientX - from < -SWIPE) turn(1);
              else if (event.clientX - from > SWIPE) turn(-1);
            }}>
            {/* Only a page turned to comes forward: the first one is there at once, as a fade-in would hold back its paint (LCP). */}
            <div key={slide.src} className={styles.page} data-turned={moved || undefined}>
              {/* The first page is the page's largest paint (LCP): preloaded, at the size it is shown (the enlarged view keeps the original). */}
              <Image src={slide.src} alt={titleOf(slide)} fill sizes="(max-width: 1072px) calc(100vw - 72px), 1000px" draggable={false} style={{ objectFit: 'contain' }}
                preload={index === 0} loading="eager" fetchPriority={index === 0 ? 'high' : 'auto'} />
            </div>
            <button type="button" className={styles.zoom} aria-label={t('このページを大きく見る')} onClick={() => onZoom(index)}>⤢</button>
          </div>
        </OrnateFrame>

        <div className={styles.controls}>
          <button type="button" aria-label={t('前のページ')} disabled={index === 0} onClick={() => turn(-1)}>‹</button>
          <span role="status" aria-live="polite" aria-atomic="true" className={styles.pageNumber}>
            <span className={styles.pageTitle}><Bi ja={slide.title} en={slide.en} /></span>
            <span>{index + 1}<small> / {allSlides.length}</small></span>
          </span>
          <button type="button" aria-label={t('次のページ')} disabled={index === allSlides.length - 1} onClick={() => turn(1)}>›</button>
        </div>

        <div ref={thumbsRef} className={styles.thumbs} aria-label={t('ページいちらん')} role="group">
          {allSlides.map((thumb, i) => (
            <button type="button" key={thumb.src} aria-label={t('{n}ページ {title}', { n: i + 1, title: titleOf(thumb) })} aria-current={i === index ? 'page' : undefined}
              className={styles.thumb} onClick={() => turnTo(i)}>
              <Image src={thumb.src} alt="" width={96} height={68} sizes="96px" loading="lazy" />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

/** A chapter chip: the Japanese title, or its English name when there is one. */
function ChipTitle({ title }: { title: string }) {
  const english = rulesHeadingEnglish[title];
  return english ? <Bi ja={title} en={english} /> : <>{title}</>;
}

function RulesText({ rulesDoc, headings }: { rulesDoc: React.ReactNode; headings: RulesHeading[] }) {
  const { t } = useI18n();
  return (
    <>
      <nav aria-label={t('もくじ')} className={`${styles.chips} ${styles.stickyChips}`}>
        <button type="button" data-ui-title data-lang="en" lang="en" className={styles.chip}
          onClick={() => document.getElementById(RULES_ENGLISH_ID)?.scrollIntoView({ behavior: 'smooth' })}>
          Overview
        </button>
        {headings.map(heading => (
          <button type="button" key={heading.id} data-ui-title className={styles.chip}
            onClick={() => document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' })}>
            <ChipTitle title={heading.title.replace(/^[\d.]+\s*/, '')} />
          </button>
        ))}
      </nav>
      <SitePanel className={styles.sheet}>{rulesDoc}</SitePanel>
    </>
  );
}

/**
 * The picture book above, the whole rules as text below: both are in the page's HTML from the server, so search
 * engines and agents read the rules without running it (docs/seo.md). The header's links jump between them;
 * `#text` (the old address of the text tab) lands on the rules.
 */
export default function AboutPage({ rulesDoc, rulesHeadings }: { rulesDoc: React.ReactNode; rulesHeadings: RulesHeading[] }) {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  const moveBy = useCallback((step: number) => {
    setOpenIndex(current => current === null ? null : clampPage(current + step));
  }, []);

  return (
    <SitePage ja="ぷぷりえーるとは" en="About PPLALE" width="lg"
      lead={<Bi
        ja="「お菓子争奪戦争ぷぷりえーる」は、VRChatから生まれた幼女とお菓子のカードゲーム。2つのデッキからカードを引き、PPを使って、相手のお菓子を先に0にしたら勝ち！ブラウザではCPU対戦やルーム対戦も楽しめます。"
        en="PPLALE (お菓子争奪戦争ぷぷりえーる) is a card game of little girls and sweets, born in VRChat. Draw cards from your two decks, spend PP, and reduce your opponent's sweets to 0 first to win! In the browser you can also play against the CPU or in online rooms." />}
      headerActions={<nav aria-label={t('よみかた')} className={styles.jumps}>
        <a href="#book"><span aria-hidden="true">📖</span><Bi ja="本でよむ" en="Pictures" /></a>
        <a href="#text"><span aria-hidden="true">📝</span><Bi ja="もじでよむ" en="Text" /></a>
      </nav>}>
      <div className={styles.about}>
        <a href={VRCHAT_WORLD_URL} target="_blank" rel="noopener noreferrer" className={styles.world}>
          <Image src="/VRChat-Logo-Black.png" alt="" width={48} height={24} />
          <Bi ja="ワールドであそぶ" en="Visit the VRChat world" /> <span aria-hidden="true">↗</span>
        </a>

        <section id="book" aria-labelledby="book-heading" className={styles.part}>
          <h2 id="book-heading" className={styles.partTitle}><Bi ja="あらすじとルールの本" en="Picture book" /></h2>
          <p data-lang="en" lang="en" className={styles.note}>The picture pages are in Japanese. The rules overview in English is below.</p>
          <Book onZoom={setOpenIndex} paused={openIndex !== null} />
        </section>

        <section id="text" aria-labelledby="text-heading" className={styles.part}>
          <h2 id="text-heading" className={styles.partTitle}><Bi ja="ルール・裁定集" en="Rules and rulings" /></h2>
          <p data-lang="en" lang="en" className={styles.note}>The rules overview is in English; the detailed rulings and FAQ are in Japanese.</p>
          {/* Its own boundary: React hydrates the long rules apart from the book, and the first page can paint in between. */}
          <Suspense fallback={null}><RulesText rulesDoc={rulesDoc} headings={rulesHeadings} /></Suspense>
        </section>
      </div>

      {openIndex !== null && <Lightbox index={openIndex} onClose={close} onMove={moveBy} />}
    </SitePage>
  );
}
