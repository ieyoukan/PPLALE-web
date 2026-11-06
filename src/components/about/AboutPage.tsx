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
import { SitePage, SitePanel } from '@/components/site/SitePage';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
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
        <OrnateFrame size="sm" className={styles.book}>
          <div className={styles.paper}>
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div key={slide.src} custom={direction} className={styles.page}
                // The next page comes forward from just behind (no turning: docs/design-system.md).
                variants={{
                  enter: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 },
                  visible: { opacity: 1, scale: 1 },
                  leave: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.01 },
                }}
                initial="enter" animate="visible" exit="leave"
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
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
          <RulesText rulesDoc={rulesDoc} headings={rulesHeadings} />
        </section>
      </div>

      <AnimatePresence>
        {openIndex !== null && <Lightbox index={openIndex} onClose={close} onMove={moveBy} />}
      </AnimatePresence>
    </SitePage>
  );
}
