'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { respondFriend, type Friendship } from '@/lib/game/social';
import { Icon } from './Icon';
import styles from './FriendActions.module.css';

export function FriendActions({ friendship, name, onRemoved }: { friendship: Friendship; name: string; onRemoved: () => void }) {
  const [expanded, setExpanded] = useState(false), [confirming, setConfirming] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setExpanded(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);
  function cancel() { setConfirming(false); trigger.current?.focus(); }
  return <div ref={wrapper} className={styles.friendActions} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }} onKeyDown={event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); setExpanded(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className={styles.friendButton} aria-expanded={expanded} aria-controls={optionsId} onClick={() => setExpanded(value => !value)} data-ui-title>
      <Icon name="heart" />フレンド<span className={styles.arrow} aria-hidden="true" />
    </button>
    {expanded && <div id={optionsId} className={styles.dropdown}>
      <button type="button" onClick={() => { setExpanded(false); setConfirming(true); }} data-ui-title>フレンド解除</button>
    </div>}
    {confirming && <RemoveFriendDialog friendship={friendship} name={name} onCancel={cancel} onRemoved={onRemoved} />}
  </div>;
}

function RemoveFriendDialog({ friendship, name, onCancel, onRemoved }: { friendship: Friendship; name: string; onCancel: () => void; onRemoved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), cancelButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal(); cancelButton.current?.focus();
    return () => element?.close();
  }, []);
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try { await respondFriend(friendship, false); onRemoved(); }
    catch { setError('解除できませんでした。もう一度お試しください'); setBusy(false); }
  }
  function dismiss() { if (!busy) { dialog.current?.close(); onCancel(); } }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <h2 id={titleId}>フレンドを解除しますか？</h2>
    <p id={descriptionId}><strong>{name}</strong>さんとのフレンドを解除します。</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.confirmActions}>
      <button ref={cancelButton} type="button" className={styles.cancel} disabled={busy} onClick={dismiss} data-ui-title>キャンセル</button>
      <button type="button" className={styles.confirm} disabled={busy} onClick={() => void remove()} data-ui-title>{busy ? '解除中…' : '解除する'}</button>
    </div>
  </dialog>;
}
