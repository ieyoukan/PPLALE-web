'use client';

// The enlarged page of ぷぷりえーるとは's book, in full size. Loaded only when opened (AboutPage), so the page
// itself carries no animation library: its measuring of the layout forced reflows on the first paint.
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n/LocaleProvider';
import { allSlides } from './aboutSlides';
import styles from './AboutPage.module.css';

export default function Lightbox({ index, onClose, onMove }: { index: number; onClose: () => void; onMove: (step: number) => void }) {
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
