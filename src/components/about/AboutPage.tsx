'use client';

import '@/app/panda.css';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { RulesHeading } from './RulesDoc';
import styles from './AboutPage.module.css';

interface Slide {
  src: string;
  title: string;
  width: number;
  height: number;
}

interface Group {
  id: string;
  title: string;
  icon: string;
  slides: Slide[];
}

type Mode = 'book' | 'text';

const landscape = (src: string, title: string): Slide => ({ src: `/images/about/${src}.webp`, title, width: 1191, height: 842 });

const groups: Group[] = [
  { id: 'story', title: 'あらすじ', icon: '📖', slides: [landscape('story', 'あらすじ')] },
  {
    id: 'rules', title: 'ルール', icon: '🃏', slides: [
      landscape('rule-1', 'ルール説明① 対戦前の準備・勝利条件・カードの見方'),
      landscape('rule-2', 'ルール説明② デッキの作り方'),
      landscape('rule-3', 'ルール説明③ 1ターン目の流れ'),
      landscape('rule-4', 'ルール説明④ 自分のターンにできること'),
      landscape('rule-5', 'ルール説明⑤ その他のルール'),
      landscape('rule-6', 'ルール説明⑥ 特殊効果'),
      landscape('rule-6-2', 'ルール説明⑥ 特殊効果 続'),
      { src: '/images/about/keywords-basic.webp', title: 'キーワード早見表 基本の特殊効果', width: 800, height: 1200 },
      { src: '/images/about/keywords.webp', title: 'キーワード早見表', width: 800, height: 1200 },
    ],
  },
  {
    id: 'faq-ichigo', title: 'FAQ', icon: '🍓',
    slides: [1, 2, 3, 4, 5, 6].map(n => landscape(`faq-ichigo-${n}`, `FAQ${n} イチゴタイプ`)),
  },
  {
    id: 'faq-budou', title: 'FAQ', icon: '🍇',
    slides: [1, 2, 3, 4, 5, 6].map(n => landscape(`faq-budou-${n}`, `FAQ${n} ぶどうタイプ`)),
  },
];

const allSlides = groups.flatMap(group => group.slides);
const groupOf = (slide: Slide) => groups.find(group => group.slides.includes(slide))!;
const clampPage = (page: number) => Math.min(allSlides.length - 1, Math.max(0, page));

function Lightbox({ index, onClose, onMove }: { index: number; onClose: () => void; onMove: (step: number) => void }) {
  const slide = allSlides[index];
  const reduceMotion = useReducedMotion();
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
      role="dialog" aria-modal="true" aria-label={slide.title} className={styles.lightbox}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button type="button" aria-label="とじる" className={styles.close} onClick={onClose}>×</button>
      <button type="button" aria-label="まえへ" disabled={index === 0} className={`${styles.arrow} ${styles.arrowLeft}`}
        onClick={event => { event.stopPropagation(); move(-1); }}>‹</button>
      <button type="button" aria-label="つぎへ" disabled={index === allSlides.length - 1} className={`${styles.arrow} ${styles.arrowRight}`}
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
            <Image src={slide.src} alt={slide.title} fill unoptimized draggable={false} style={{ objectFit: 'contain' }} />
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
      <nav aria-label="しょう" className={styles.chips}>
        {groups.map(group => (
          <button type="button" key={group.id} data-ui-title aria-label={`${group.icon} ${group.title}を開く`}
            aria-pressed={activeGroup.id === group.id} className={styles.chip}
            onClick={() => turnTo(allSlides.indexOf(group.slides[0]))}>
            <span aria-hidden="true">{group.icon}</span>{group.title}
          </button>
        ))}
      </nav>

      <section className={styles.reader} aria-label="ぷぷりえーるの本" tabIndex={0}
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
                <Image src={slide.src} alt={slide.title} fill unoptimized draggable={false} style={{ objectFit: 'contain' }} />
              </motion.div>
            </AnimatePresence>
            <button type="button" className={styles.zoom} aria-label="このページを大きく見る" onClick={() => onZoom(index)}>⤢</button>
          </div>
        </div>

        <div className={styles.controls}>
          <button type="button" aria-label="前のページ" disabled={index === 0} onClick={() => turn(-1)}>‹</button>
          <span role="status" aria-live="polite" aria-atomic="true" className={styles.pageNumber}>
            <span className={styles.pageTitle}>{slide.title}</span>
            <span>{index + 1}<small> / {allSlides.length}</small></span>
          </span>
          <button type="button" aria-label="次のページ" disabled={index === allSlides.length - 1} onClick={() => turn(1)}>›</button>
        </div>

        <div ref={thumbsRef} className={styles.thumbs} aria-label="ページいちらん" role="group">
          {allSlides.map((thumb, i) => (
            <button type="button" key={thumb.src} aria-label={`${i + 1}ページ ${thumb.title}`} aria-current={i === index ? 'page' : undefined}
              className={styles.thumb} onClick={() => turnTo(i)}>
              <Image src={thumb.src} alt="" width={96} height={68} unoptimized loading="lazy" />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function RulesText({ rulesDoc, headings }: { rulesDoc: React.ReactNode; headings: RulesHeading[] }) {
  return (
    <>
      <nav aria-label="もくじ" className={`${styles.chips} ${styles.stickyChips}`}>
        {headings.map(heading => (
          <button type="button" key={heading.id} data-ui-title className={styles.chip}
            onClick={() => document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' })}>
            {heading.title.replace(/^[\d.]+\s*/, '')}
          </button>
        ))}
      </nav>
      <article aria-label="ルール・裁定集" className={styles.sheet}>{rulesDoc}</article>
    </>
  );
}

export default function AboutPage({ rulesDoc, rulesHeadings }: { rulesDoc: React.ReactNode; rulesHeadings: RulesHeading[] }) {
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
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" aria-label="トップへもどる" className={styles.back}>‹</Link>
          <div role="tablist" aria-label="よみかた" className={styles.modes}>
            {([['book', '📖', '本でよむ'], ['text', '📝', 'もじでよむ']] as const).map(([value, icon, label]) => (
              <button type="button" role="tab" key={value} aria-selected={mode === value} className={styles.mode}
                onClick={() => changeMode(value)}>
                <span aria-hidden="true">{icon}</span>{label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <motion.h1 className={styles.title} initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          ぷぷりえーるとは
        </motion.h1>
        {mode === 'book' ? <Book onZoom={setOpenIndex} paused={openIndex !== null} /> : <RulesText rulesDoc={rulesDoc} headings={rulesHeadings} />}
      </div>

      <AnimatePresence>
        {openIndex !== null && <Lightbox index={openIndex} onClose={close} onMove={moveBy} />}
      </AnimatePresence>
    </main>
  );
}
