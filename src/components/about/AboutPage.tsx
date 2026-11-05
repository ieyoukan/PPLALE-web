'use client';

import '@/app/panda.css';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { RulesHeading } from './RulesDoc';
import { RULES_ENGLISH_ID, rulesHeadingEnglish } from './RulesEnglish';
import { Bi } from '@/i18n/Bi';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './AboutPage.module.css';
import { SiteHeader } from '@/components/site/SiteHeader';
import { VRCHAT_WORLD_URL } from '@/lib/communityLinks';

interface Slide {
  src: string;
  title: string;
  /** The title in English (the page images themselves are in Japanese). */
  en: string;
  width: number;
  height: number;
}

interface Group {
  id: string;
  title: string;
  en: string;
  icon: string;
  slides: Slide[];
}

type Mode = 'book' | 'text';

const landscape = (src: string, title: string, en: string): Slide => ({ src: `/images/about/${src}.webp`, title, en, width: 1191, height: 842 });

const groups: Group[] = [
  { id: 'story', title: 'あらすじ', en: 'Story', icon: '📖', slides: [landscape('story', 'あらすじ', 'Story')] },
  {
    id: 'rules', title: 'ルール', en: 'Rules', icon: '🃏', slides: [
      landscape('rule-1', 'ルール説明① 対戦前の準備・勝利条件・カードの見方', 'Rules 1: Setup, how to win and reading a card'),
      landscape('rule-2', 'ルール説明② デッキの作り方', 'Rules 2: Building a deck'),
      landscape('rule-3', 'ルール説明③ 1ターン目の流れ', 'Rules 3: Your first turn'),
      landscape('rule-4', 'ルール説明④ 自分のターンにできること', 'Rules 4: What you can do on your turn'),
      landscape('rule-5', 'ルール説明⑤ その他のルール', 'Rules 5: Other rules'),
      landscape('rule-6', 'ルール説明⑥ 特殊効果', 'Rules 6: Special abilities'),
      landscape('rule-6-2', 'ルール説明⑥ 特殊効果 続', 'Rules 6: Special abilities (cont.)'),
      { src: '/images/about/keywords-basic.webp', title: 'キーワード早見表 基本の特殊効果', en: 'Keyword guide: basic abilities', width: 800, height: 1200 },
      { src: '/images/about/keywords.webp', title: 'キーワード早見表', en: 'Keyword guide', width: 800, height: 1200 },
    ],
  },
  {
    id: 'faq-ichigo', title: 'FAQ', en: 'FAQ', icon: '🍓',
    slides: [1, 2, 3, 4, 5, 6].map(n => landscape(`faq-ichigo-${n}`, `FAQ${n} イチゴタイプ`, `FAQ ${n}: Strawberry`)),
  },
  {
    id: 'faq-budou', title: 'FAQ', en: 'FAQ', icon: '🍇',
    slides: [1, 2, 3, 4, 5, 6].map(n => landscape(`faq-budou-${n}`, `FAQ${n} ぶどうタイプ`, `FAQ ${n}: Grape`)),
  },
];

const allSlides = groups.flatMap(group => group.slides);
const groupOf = (slide: Slide) => groups.find(group => group.slides.includes(slide))!;
const clampPage = (page: number) => Math.min(allSlides.length - 1, Math.max(0, page));

function Lightbox({ index, onClose, onMove }: { index: number; onClose: () => void; onMove: (step: number) => void }) {
  const slide = allSlides[index];
  const reduceMotion = useReducedMotion();
  const { t, locale } = useI18n();
  const slideTitle = locale === 'en' ? slide.en : slide.title;
  const [direction, setDirection] = useState(0);

  const move = useCallback((step: number) => {
    setDirection(step);
    onMove(step);
  }, [onMove]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [move, onClose]);

  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label={slideTitle} className={styles.lightbox}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button type="button" aria-label={t('とじる')} className={styles.close} onClick={onClose}>×</button>
      <button type="button" aria-label={t('まえへ')} disabled={index === 0} className={`${styles.arrow} ${styles.arrowLeft}`}
        onClick={event => { event.stopPropagation(); move(-1); }}>‹</button>
      <button type="button" aria-label={t('つぎへ')} disabled={index === allSlides.length - 1} className={`${styles.arrow} ${styles.arrowRight}`}
        onClick={event => { event.stopPropagation(); move(1); }}>›</button>

      <div className={styles.lightboxStage}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={slide.src}
            className={styles.lightboxSlide}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 120, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -120, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 && index < allSlides.length - 1) move(1);
              if (info.offset.x > 60 && index > 0) move(-1);
            }}
            onClick={event => event.stopPropagation()}
          >
            <Image src={slide.src} alt={slideTitle} fill unoptimized draggable={false} style={{ objectFit: 'contain' }} />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Book({ onZoom, paused }: { onZoom: (page: number) => void; paused: boolean }) {
  const [{ index, direction }, setPage] = useState({ index: 0, direction: 1 });
  const reduceMotion = useReducedMotion();
  const thumbsRef = useRef<HTMLDivElement>(null);
  const slide = allSlides[index];
  const activeGroup = groupOf(slide);
  const { t, locale } = useI18n();
  const titleOf = (page: Slide) => locale === 'en' ? page.en : page.title;

  const turnTo = (next: number) => setPage(current => {
    const index = clampPage(next);
    return index === current.index ? current : { index, direction: index > current.index ? 1 : -1 };
  });
  const turn = (step: number) => setPage(current => {
    const index = clampPage(current.index + step);
    return index === current.index ? current : { index, direction: step };
  });

  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[index] as HTMLElement | undefined;
    if (strip && thumb) strip.scrollTo({ left: thumb.offsetLeft - strip.clientWidth / 2 + thumb.clientWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [index, reduceMotion]);

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
        <div className={styles.book}>
          <div className={styles.paper}>
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div key={slide.src} custom={direction} className={styles.page}
                variants={{
                  enter: (direction: number) => reduceMotion ? { opacity: 0 } : { opacity: 0, rotateY: direction > 0 ? 75 : -75 },
                  visible: { opacity: 1, rotateY: 0 },
                  leave: (direction: number) => reduceMotion ? { opacity: 0 } : { opacity: 0, rotateY: direction > 0 ? -75 : 75 },
                }}
                initial="enter" animate="visible" exit="leave"
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeInOut' }}
                style={{ transformOrigin: direction > 0 ? 'left center' : 'right center' }}
                drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.15}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -45) turn(1);
                  if (info.offset.x > 45) turn(-1);
                }}>
                <Image src={slide.src} alt={titleOf(slide)} fill unoptimized draggable={false} style={{ objectFit: 'contain' }} />
              </motion.div>
            </AnimatePresence>
            <button type="button" className={styles.zoom} aria-label={t('このページを大きく見る')} onClick={() => onZoom(index)}>⤢</button>
          </div>
        </div>

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
              <Image src={thumb.src} alt="" width={96} height={68} unoptimized loading="lazy" />
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
      <article aria-label={t('ルール・裁定集')} className={styles.sheet}>{rulesDoc}</article>
    </>
  );
}

export default function AboutPage({ rulesDoc, rulesHeadings }: { rulesDoc: React.ReactNode; rulesHeadings: RulesHeading[] }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('book');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  const moveBy = useCallback((step: number) => {
    setOpenIndex(current => current === null ? null : clampPage(current + step));
  }, []);

  useEffect(() => {
    if (window.location.hash === '#text') setMode('text');
  }, []);

  const changeMode = (next: Mode) => {
    setMode(next);
    window.history.replaceState(null, '', next === 'text' ? '#text' : window.location.pathname);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className={styles.main}>
      <SiteHeader>
          <div role="tablist" aria-label={t('よみかた')} className={styles.modes}>
            {([['book', '📖', '本でよむ', 'Pictures'], ['text', '📝', 'もじでよむ', 'Text']] as const).map(([value, icon, label, english]) => (
              <button type="button" role="tab" key={value} aria-selected={mode === value} className={styles.mode}
                onClick={() => changeMode(value)}>
                <span aria-hidden="true">{icon}</span><Bi ja={label} en={english} />
              </button>
            ))}
          </div>
      </SiteHeader>

      <div className={styles.content}>
        <motion.h1 className={styles.title} initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Bi ja="ぷぷりえーるとは" en="About PPLALE" />
        </motion.h1>
        <a href={VRCHAT_WORLD_URL} target="_blank" rel="noopener noreferrer" className={styles.world}>
          <Image src="/VRChat-Logo-Black.png" alt="" width={48} height={24} />
          <Bi ja="ワールドであそぶ" en="Visit the VRChat world" /> <span aria-hidden="true">↗</span>
        </a>
        <p data-lang="en" lang="en" className={styles.note}>
          {mode === 'book' ? 'The picture pages are in Japanese. Tap "Text" for the rules in English.' : 'The rules overview is in English; the detailed rulings and FAQ are in Japanese.'}
        </p>
        {mode === 'book' ? <Book onZoom={setOpenIndex} paused={openIndex !== null} /> : <RulesText rulesDoc={rulesDoc} headings={rulesHeadings} />}
      </div>

      <AnimatePresence>
        {openIndex !== null && <Lightbox index={openIndex} onClose={close} onMove={moveBy} />}
      </AnimatePresence>
    </main>
  );
}
