'use client';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './Plaza.module.css';

/** A framed card that rises over the table for one choice. Escape, the × and the backdrop close it; focus stays inside. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className={styles.sheetBackdrop} onClick={onClose} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }} data-plaza-sheet>
    <OrnateFrame ref={panel} className={`${styles.sheet} ${wide ? styles.sheetWide : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
      <header className={styles.sheetHead}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className={styles.round} onClick={onClose} aria-label="閉じる"><GameIcon name="close" /></button>
      </header>
      <div className={styles.sheetBody}>{children}</div>
    </OrnateFrame>
  </div>;
}
