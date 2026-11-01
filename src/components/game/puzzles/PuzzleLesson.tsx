'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import type { LethalPuzzle } from '@/lib/game/puzzles';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './Puzzles.module.css';

/** 初回に説明を開き、挑戦中も同じボタンから読み直せる。 */
export function PuzzleLesson({ lesson }: { lesson: NonNullable<LethalPuzzle['lesson']> }) {
  const [open, setOpen] = useState(true);
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, [open]);
  return <>
    <button ref={trigger} className={styles.lessonButton} onClick={() => setOpen(true)}>{t('この問題で学ぶこと')}</button>
    {open && <dialog ref={dialog} className={styles.lessonDialog} aria-labelledby={title} onKeyDown={event => event.stopPropagation()} onClose={event => { if (!event.currentTarget.open) { setOpen(false); trigger.current?.focus(); } }}>
      <OrnateFrame className={styles.lessonContent}>
        <h2 id={title} data-ui-title>{t(lesson.title)}</h2>
        <div>{lesson.paragraphs.map(paragraph => <p key={paragraph}>{t(paragraph)}</p>)}</div>
        <button autoFocus onClick={() => dialog.current?.close()}>{t('挑戦する')}</button>
      </OrnateFrame>
    </dialog>}
  </>;
}
