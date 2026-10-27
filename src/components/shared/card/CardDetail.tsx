'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import type { CardInfo } from '@/types/card';
import type { TokenCard } from '@/lib/schema';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './CardDetail.module.css';

const basePath = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true' ? '/PPLALE-web_front' : '';
interface CardDetailProps {
  card: CardInfo | TokenCard;
  onClose: () => void;
  canAddToDeck?: (card: CardInfo) => boolean;
  onAddToDeck?: (card: CardInfo) => void;
  handleCardRemove?: (card: CardInfo) => void;
  isInDeck: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Shared card inspection: a viewport portal, pointer tilt, front/back faces and optional deck actions. */
export default function CardDetail({ card, onClose, canAddToDeck, onAddToDeck, isInDeck, handleCardRemove, returnFocusRef }: CardDetailProps) {
  const { locale, t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null), overlayRef = useRef<HTMLDivElement>(null);
  const closeOnEscape = useEffectEvent(onClose);
  useEffect(() => {
    const previous = returnFocusRef?.current ?? document.activeElement as HTMLElement | null;
    overlayRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); event.stopImmediatePropagation(); closeOnEscape();
    };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); requestAnimationFrame(() => previous?.focus({ preventScroll: true })); };
  }, [returnFocusRef]);

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const element = cardRef.current;
    if (!element || event.pointerType === 'touch') return;
    const x = event.clientX / window.innerWidth - .5, y = event.clientY / window.innerHeight - .5;
    element.style.transform = `rotateX(${y * -24}deg) rotateY(${x * 36}deg)`;
    element.style.setProperty('--shine-x', `${(x + .5) * 100}%`);
    element.style.setProperty('--shine-y', `${(y + .5) * 100}%`);
  };
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = Array.from(overlayRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const buildCard = card.fruit !== 'none' ? card : null;
  const canAdd = buildCard ? canAddToDeck?.(buildCard) ?? false : false;
  return createPortal(<div ref={overlayRef} data-card-detail className={styles.backdrop}
    onClick={event => { event.stopPropagation(); onClose(); }} onKeyDown={trapFocus} onPointerMove={tilt}>
    <div role="dialog" aria-modal="true" aria-label={locale === 'ja' ? `${card.name}の拡大表示` : `Enlarged view of ${card.name}`} className={styles.dialog} onClick={event => event.stopPropagation()}>
      <div className={styles.cardShell}>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('拡大表示を閉じる')}>×</button>
        <div ref={cardRef} className={styles.rotatingCard}>
          <div className={`${styles.face} ${styles.front}`}>
            <Image src={`${basePath}${card.imageUrl}`} alt={card.name} fill sizes="(max-width: 768px) 90vw, 500px" className={styles.image} unoptimized priority />
            <div className={styles.shine} />
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <Image src={`${basePath}/images/back-card.webp`} alt={t('カード裏面')} fill sizes="(max-width: 768px) 90vw, 500px" className={styles.image} unoptimized priority />
          </div>
        </div>
      </div>
      {buildCard && canAddToDeck && onAddToDeck ? <button type="button" className={styles.action} onClick={() => onAddToDeck(buildCard)} disabled={!canAdd}>{t(card.type === 'playable' ? '選択する' : 'デッキに追加')}</button>
        : buildCard && isInDeck ? <button type="button" className={`${styles.action} ${styles.remove}`} onClick={() => handleCardRemove?.(buildCard)}>{t('デッキから削除')}</button> : null}
    </div>
  </div>, document.body);
}
