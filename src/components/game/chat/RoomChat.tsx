'use client';

// Lives beside the launchpad in the game layout: changing screens never leaves the conversation.
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_ROOM_CHAT_LENGTH } from '@pplale/game-core/room';
import { Avatar } from '@/components/shared/player/Avatar';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { usePlaza } from '../plaza/PlazaProvider';
import styles from './RoomChat.module.css';

const Context = createContext(false);
export const useRoomChatOpen = () => useContext(Context);

export function RoomChatProvider({ children }: { children: ReactNode }) {
  const { id, view } = usePlaza();
  const [opened, setOpened] = useState<string | null>(null);
  const available = !!id && !!view?.plaza, open = available && opened === id;
  return <Context.Provider value={open}>
    {children}
    {available && <RoomChat key={id} open={open} onOpen={() => setOpened(id)} onClose={() => setOpened(null)} />}
  </Context.Provider>;
}

function RoomChat({ open, onOpen, onClose }: { open: boolean; onOpen(): void; onClose(): void }) {
  const { chat, view, send, linked } = usePlaza();
  const [draft, setDraft] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null), nearEnd = useRef(true), busy = useRef(false);
  const pending = useRef<{ text: string; messageId: string } | null>(null), panelId = useId();
  const profiles = useProfiles(open ? chat.map(message => message.profileId) : []);
  const ready = linked && !!view?.plaza?.chatEnabled;
  const show = () => { previousFocus.current = document.activeElement as HTMLElement | null; onOpen(); };
  const close = () => { onClose(); if (previousFocus.current?.isConnected) previousFocus.current.focus(); };

  // Capture Escape before the launchpad's own handler. T never steals a key from an input or IME.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== 't' || target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      event.preventDefault();
      if (open) input.current?.focus(); else show();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  useEffect(() => { if (open) { input.current?.focus(); nearEnd.current = true; } }, [open]);
  useEffect(() => {
    if (open && nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat, open]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy.current || !ready) return;
    busy.current = true; setSending(true); setError('');
    if (pending.current?.text !== text) pending.current = { text, messageId: crypto.randomUUID() };
    try {
      await send({ action: 'chat', ...pending.current });
      pending.current = null; setDraft(''); nearEnd.current = true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '送信できませんでした'); }
    finally { busy.current = false; setSending(false); }
  };

  return <aside className={styles.chat} aria-label="ルーム内チャット" data-room-chat>
    {open && <OrnateFrame as="section" size="sm" className={styles.panel} id={panelId} aria-label="いまのルームの会話">
      <header className={styles.header}><h2 data-ui-title>ルームチャット</h2><button type="button" onClick={close} aria-label="チャットを閉じる"><GameIcon name="close" /></button></header>
      <div ref={log} role="log" aria-label="チャットのメッセージ" aria-live="polite" aria-relevant="additions" className={styles.log} onScroll={event => {
        const box = event.currentTarget; nearEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      }}>
        {!chat.length && <p className={styles.empty}>いまのルームのみんなと話そう</p>}
        {chat.map(message => <div key={message.id} className={styles.message} data-own={message.member === view?.plaza?.me || undefined}>
          <Avatar card={message.profileId ? profiles[message.profileId]?.iconCardId : guestIcon(message.member)} size={32} />
          <div className={styles.content}><div className={styles.byline}><strong title={message.name}>{message.name}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></div>
        </div>)}
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <textarea ref={input} aria-label="メッセージ" placeholder={ready ? 'メッセージを入力' : linked ? 'チャットを準備しています' : '再接続しています…'} rows={2} maxLength={MAX_ROOM_CHAT_LENGTH * 2} value={draft} readOnly={sending} onChange={event => setDraft(Array.from(event.target.value).slice(0, MAX_ROOM_CHAT_LENGTH).join(''))} onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault(); void submit();
        }} />
        <button type="submit" disabled={!ready || !draft.trim() || sending} aria-label="メッセージを送信"><GameIcon name="send" /></button>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </OrnateFrame>}
    <button type="button" className={styles.toggle} onClick={open ? close : show} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-keyshortcuts="T" aria-label="ルームチャット"><GameIcon name="chat" /><span data-ui-title>チャット</span><kbd>T</kbd></button>
  </aside>;
}
