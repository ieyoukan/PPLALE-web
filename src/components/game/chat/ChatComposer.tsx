'use client';

import type { RefObject } from 'react';
import { MAX_ROOM_CHAT_LENGTH } from '@pplale/game-core/room';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './RoomChat.module.css';

/** 日本語変換の確定では送信せず、通常のEnterで送信する。 */
export function ChatComposer({ inputRef, draft, error, sending, ready, linked, stampsReady, stampsOpen, onDraftChange, onToggleStamps, onSubmit }: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  error: string;
  sending: boolean;
  ready: boolean;
  linked: boolean;
  stampsReady: boolean;
  stampsOpen: boolean;
  onDraftChange: (draft: string) => void;
  onToggleStamps: () => void;
  onSubmit: () => Promise<void>;
}) {
  const placeholder = ready ? 'タップして入力' : linked ? '接続中…' : '再接続中…';

  return <form className={styles.composer} onSubmit={event => { event.preventDefault(); void onSubmit(); }}>
    <button type="button" className={styles.stampToggle} disabled={!stampsReady || sending} aria-label="スタンプ" title="スタンプ" aria-expanded={stampsOpen} onClick={onToggleStamps}>
      <GameIcon name="sticker" />
    </button>
    <textarea ref={inputRef} aria-label="メッセージ" placeholder={placeholder} rows={1} wrap="off" maxLength={MAX_ROOM_CHAT_LENGTH * 2}
      value={draft} readOnly={sending}
      onChange={event => onDraftChange(Array.from(event.target.value).slice(0, MAX_ROOM_CHAT_LENGTH).join(''))}
      onKeyDown={event => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        void onSubmit();
      }} />
    <button type="submit" disabled={!ready || !draft.trim() || sending} aria-label="メッセージを送信">送信</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </form>;
}
