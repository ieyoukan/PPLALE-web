'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { OrnateFrame } from './ornament/OrnateFrame';
import styles from './ConfirmDialog.module.css';

/** 盤面を残した確認モーダル。フォーカスと操作をダイアログ内に限定する。 */
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'キャンセル', onConfirm, onCancel, onDone, disabled = false }: {
  title: string; description: string; confirmLabel: string; cancelLabel?: string;
  onConfirm: () => void | Promise<void>; onCancel: () => void; onDone: () => void; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null), submitting = useRef(false);
  const titleId = useId(), descriptionId = useId();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => { node?.close(); previous?.focus?.(); };
  }, []);
  const confirm = async () => {
    if (submitting.current || disabled) return;
    submitting.current = true; setBusy(true); setError('');
    try { await onConfirm(); onDone(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '操作を送れませんでした。もう一度お試しください'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); if (!submitting.current) onCancel(); }}
    onClick={event => { if (event.target === event.currentTarget && !submitting.current) onCancel(); }}>
    <OrnateFrame className={styles.content}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={styles.confirm} disabled={busy || disabled} onClick={() => void confirm()}>{busy ? '送信中…' : confirmLabel}</button>
      </div>
    </OrnateFrame>
  </dialog>;
}
