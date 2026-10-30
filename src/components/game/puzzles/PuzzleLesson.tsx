'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import type { LethalPuzzle } from '@/lib/game/puzzles';
import styles from './Puzzles.module.css';

/** 初回に説明を開き、挑戦中も同じボタンから読み直せる。 */
export function PuzzleLesson({ lesson }: { lesson: NonNullable<LethalPuzzle['lesson']> }) {
  const [open, setOpen] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, [open]);
  return <>
    <button ref={trigger} className={styles.lessonButton} onClick={() => setOpen(true)}>この問題で学ぶこと</button>
    {open && <dialog ref={dialog} className={styles.lessonDialog} aria-labelledby={title} onKeyDown={event => event.stopPropagation()} onClose={event => { if (!event.currentTarget.open) { setOpen(false); trigger.current?.focus(); } }}>
      <OrnateFrame className={styles.lessonContent}>
        <h2 id={title} data-ui-title>{lesson.title}</h2>
        <div>{lesson.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        <button autoFocus onClick={() => dialog.current?.close()}>挑戦する</button>
      </OrnateFrame>
    </dialog>}
  </>;
}
