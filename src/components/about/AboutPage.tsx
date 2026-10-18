'use client';

import '@/app/panda.css';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';

const darumadrop = Darumadrop_One({ weight: '400', subsets: ['latin'], display: 'swap' });

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
      { src: '/images/about/keywords.webp', title: 'キーワード早見表', width: 800, height: 1200 },
      landscape('dice', '6面ダイスだけでランダム効果の裁定を行うやり方'),
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
  { id: 'credit', title: 'クレジット', icon: '✨', slides: [landscape('credit', 'クレジット')] },
];

const allSlides = groups.flatMap(group => group.slides);

function GroupIcon({ icon }: { icon: string }) {
  return icon.startsWith('/')
    ? <Image src={icon} alt="" width={28} height={28} className={css({ w: '7', h: '7', objectFit: 'contain' })} />
    : <span aria-hidden="true" className={css({ fontSize: 'xl', lineHeight: '1' })}>{icon}</span>;
}

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

  const arrowClass = css({
    position: 'absolute', top: '50%', translate: '0 -50%', zIndex: '2',
    w: '12', h: '12', rounded: 'full', bg: 'white/90', color: 'pink.600',
    fontSize: '2xl', fontWeight: 'bold', boxShadow: 'lg', cursor: 'pointer',
    display: { base: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.15s ease',
    _hover: { transform: 'scale(1.1)' },
    _disabled: { opacity: '0.3', cursor: 'default', transform: 'none' },
  });

  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label={slide.title}
      className={css({
        position: 'fixed', inset: '0', zIndex: '50', bg: 'rgba(40, 16, 34, 0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        px: { base: '2', md: '20' }, py: '14',
      })}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button type="button" aria-label="とじる" onClick={onClose} className={css({
        position: 'absolute', top: '3', right: '3', w: '11', h: '11', rounded: 'full',
        bg: 'white/90', color: 'pink.600', fontSize: '2xl', fontWeight: 'bold', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'lg',
      })}>×</button>

      <button type="button" aria-label="まえへ" disabled={index === 0} className={`${arrowClass} ${css({ left: '4' })}`}
        onClick={event => { event.stopPropagation(); move(-1); }}>‹</button>
      <button type="button" aria-label="つぎへ" disabled={index === allSlides.length - 1} className={`${arrowClass} ${css({ right: '4' })}`}
        onClick={event => { event.stopPropagation(); move(1); }}>›</button>

      <div className={css({ position: 'relative', w: 'full', flex: '1', minH: '0' })}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={slide.src}
            custom={direction}
            className={css({ position: 'absolute', inset: '0', touchAction: 'pan-y' })}
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
            <Image src={slide.src} alt={slide.title} fill unoptimized draggable={false}
              style={{ objectFit: 'contain' }} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div aria-hidden="true" className={css({ display: 'flex', gap: '1.5', mt: '4', flexWrap: 'wrap', justifyContent: 'center' })}>
        {allSlides.map((s, i) => (
          <motion.span key={s.src} animate={{ width: i === index ? 20 : 8, opacity: i === index ? 1 : 0.45 }}
            className={css({ h: '2', rounded: 'full', bg: 'pink.200' })} />
        ))}
      </div>
    </motion.div>
  );
}

export default function AboutPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  const moveBy = useCallback((step: number) => {
    setOpenIndex(current => current === null ? null : Math.min(allSlides.length - 1, Math.max(0, current + step)));
  }, []);

  return (
    <main className={css({ position: 'relative', minH: 'screen', w: 'full' })}>
      <div aria-hidden="true" className={css({ position: 'fixed', inset: '0', zIndex: '-1' })}
        style={{ backgroundImage: 'url("/images/check-pattern.png")', backgroundRepeat: 'repeat', backgroundSize: '100px 100px' }}>
        <div className={css({ position: 'absolute', inset: '0', bg: 'black/10' })} />
      </div>

      <nav aria-label="もくじ" className={css({
        position: 'sticky', top: '0', zIndex: '20', bg: 'white/85', backdropBlur: 'md',
        borderBottomWidth: '2px', borderColor: 'pink.200', boxShadow: 'sm',
      })}>
        <div className={css({ maxW: '6xl', mx: 'auto', px: '3', py: '2', display: 'flex', alignItems: 'center', gap: '2' })}>
          <Link href="/" aria-label="トップへもどる" className={css({
            flexShrink: '0', w: '10', h: '10', rounded: 'full', bg: 'pink.100', color: 'pink.600',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'xl', fontWeight: 'bold',
            transition: 'transform 0.15s ease', _hover: { transform: 'scale(1.1)' },
          })}>‹</Link>
          <div className={css({ display: 'flex', gap: '2', overflowX: 'auto', scrollbarWidth: 'none', py: '1' })}>
            {groups.map(group => (
              <a key={group.id} href={`#${group.id}`} className={`${darumadrop.className} ${css({
                flexShrink: '0', display: 'flex', alignItems: 'center', gap: '1.5', px: '3.5', h: '10',
                rounded: 'full', bg: 'white', borderWidth: '2px', borderColor: 'pink.200', color: 'pink.600',
                fontSize: 'lg', whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                _hover: { bg: 'pink.50', borderColor: 'pink.400', transform: 'translateY(-2px)' },
              })}`}>
                <GroupIcon icon={group.icon} />{group.title}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className={css({ maxW: '6xl', mx: 'auto', px: '4', pt: '8', pb: '24' })}>
        <motion.h1
          className={`${darumadrop.className} ${css({ fontSize: '4xl', md: { fontSize: '5xl' }, textAlign: 'center', color: 'white', mb: '6' })}`}
          initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          style={{ WebkitTextStroke: '3px #f9a8d4', paintOrder: 'stroke fill' }}
        >
          ぷぷりえーるとは
        </motion.h1>

        {groups.map(group => (
          <section key={group.id} id={group.id} aria-label={group.title} className={css({ scrollMarginTop: '20', mt: '10' })}>
            <h2 className={`${darumadrop.className} ${css({
              display: 'inline-flex', alignItems: 'center', gap: '2', mb: '4', px: '5', py: '1.5',
              rounded: 'full', bg: 'yellow.200/90', color: 'pink.500', fontSize: '2xl', boxShadow: 'md',
            })}`}>
              <GroupIcon icon={group.icon} />{group.title}
            </h2>
            <div className={css({
              display: 'grid', gap: '4',
              gridTemplateColumns: group.slides.length === 1 ? '1fr' : { base: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
              maxW: group.slides.length === 1 ? '3xl' : 'none',
            })}>
              {group.slides.map(slide => (
                <motion.button
                  key={slide.src}
                  type="button"
                  aria-label={`${slide.title}を大きく見る`}
                  onClick={() => setOpenIndex(allSlides.indexOf(slide))}
                  className={css({
                    position: 'relative', display: 'block', w: 'full', bg: 'white', p: '1.5',
                    rounded: '2xl', overflow: 'hidden', cursor: 'zoom-in',
                    boxShadow: '0 8px 20px rgba(157, 70, 108, 0.18)',
                    gridRow: slide.height > slide.width ? { sm: 'span 2' } : undefined,
                    _focusVisible: { outline: '3px solid', outlineColor: 'pink.500', outlineOffset: '3px' },
                  })}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  whileHover={{ y: -6 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Image src={slide.src} alt={slide.title} width={slide.width} height={slide.height} unoptimized
                    className={css({ w: 'full', h: slide.height > slide.width ? 'full' : 'auto', objectFit: 'contain', rounded: 'xl' })} />
                </motion.button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <AnimatePresence>
        {openIndex !== null && <Lightbox index={openIndex} onClose={close} onMove={moveBy} />}
      </AnimatePresence>
    </main>
  );
}
