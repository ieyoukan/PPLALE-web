'use client';

// Lives beside the launchpad in the game layout: changing screens never leaves the conversation.
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ROOM_CHAT_STAMPS, MAX_ROOM_CHAT_LENGTH } from '@pplale/game-core/room';
import { ChatStamp } from '@/components/shared/chat/ChatStamp';
import type { RoomChatStampId } from '@pplale/game-core/room';
import { Avatar } from '@/components/shared/player/Avatar';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { isPlazaPath, plazaHref, usePlaza } from '../plaza/PlazaProvider';
import styles from './RoomChat.module.css';

const Context = createContext(false);
export const useRoomChatOpen = () => useContext(Context);

export function RoomChatProvider({ children }: { children: ReactNode }) {
  const { id, view, stage } = usePlaza(), pathname = usePathname();
  const arriving = pathname === '/game' || pathname === '/game/' || (isPlazaPath(pathname) && pathname !== plazaHref(id ?? ''));
  const [opened, setOpened] = useState<string | null>(null);
  const available = !arriving && stage.kind === 'in' && !!id && view?.id === id && view.status !== 'closed' && !!view.plaza?.members.some(member => member.id === view.plaza?.me), open = available && opened === id;
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
  type Content = { text: string; stamp?: never } | { stamp: RoomChatStampId; text?: never };
  const pending = useRef<(Content & { messageId: string }) | null>(null), panelId = useId();
  const [stampsOpen, setStampsOpen] = useState(false);
  // Initial/replayed history is already known. Only newly received messages from others count.
  const observed = useRef(new Set(chat.map(message => message.id)));
  const [unread, setUnread] = useState(0);
  const me = view?.plaza?.me, unreadId = `${panelId}-unread`;
  useEffect(() => {
    const fresh = chat.filter(message => !observed.current.has(message.id) && message.member !== me).length;
    observed.current = new Set(chat.map(message => message.id));
    setUnread(previous => open && !document.hidden ? 0 : previous + fresh);
  }, [chat, me, open]);
  useEffect(() => {
    const visible = () => { if (open && !document.hidden) setUnread(0); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [open]);
  const profiles = useProfiles(open ? chat.map(message => message.profileId) : []);
  const ready = linked && !!view?.plaza?.chatEnabled, stampsReady = ready && !!view?.plaza?.chatStamps;
  const show = () => { previousFocus.current = document.activeElement as HTMLElement | null; onOpen(); };
  const close = () => { onClose(); if (previousFocus.current?.isConnected) previousFocus.current.focus(); };

  // Capture Escape before the launchpad's own handler. T never steals a key from an input or IME.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); if (stampsOpen) setStampsOpen(false); else close(); return; }
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

  const submit = async (content: Content = { text: draft.trim() }) => {
    if ((!content.stamp && !content.text?.trim()) || busy.current || !ready || (content.stamp && !stampsReady)) return;
    busy.current = true; setSending(true); setError('');
    if (!pending.current || pending.current.text !== content.text || pending.current.stamp !== content.stamp) pending.current = { ...content, messageId: crypto.randomUUID() };
    try {
      await send({ action: 'chat', ...pending.current });
      pending.current = null; if (content.stamp) setStampsOpen(false); else setDraft(''); nearEnd.current = true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '送信できませんでした'); }
    finally { busy.current = false; setSending(false); }
  };

  return <aside className={styles.chat} aria-label="ルーム内チャット" data-room-chat>
    {open && <OrnateFrame as="section" appearance="panel" size="sm" className={styles.panel} id={panelId} aria-label="いまのルームの会話">
      <div ref={log} role="log" aria-label="チャットのメッセージ" aria-live="polite" aria-relevant="additions" className={styles.log} onScroll={event => {
        const box = event.currentTarget; nearEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      }}>
        {chat.map(message => <div key={message.id} className={styles.message} data-own={message.member === view?.plaza?.me || undefined}>
          <Avatar card={message.profileId ? profiles[message.profileId]?.iconCardId : guestIcon(message.member)} size={48} />
          <div className={styles.content}><div className={styles.byline}><strong title={message.name}>{message.name}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</time></div>{message.stamp ? <ChatStamp id={message.stamp} /> : <p>{message.text}</p>}</div>
        </div>)}
      </div>
      {stampsOpen && <OrnateFrame as="div" size="sm" appearance="panel" className={styles.stamps} role="region" aria-label="スタンプ一覧">{ROOM_CHAT_STAMPS.map(stamp => <button key={stamp.id} type="button" disabled={!stampsReady || sending} onClick={() => void submit({ stamp: stamp.id })} aria-label={`${stamp.label}を送信`}><ChatStamp id={stamp.id} /></button>)}</OrnateFrame>}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <button type="button" className={styles.stampToggle} disabled={!stampsReady || sending} aria-label="スタンプ" aria-expanded={stampsOpen} onClick={() => setStampsOpen(value => !value)}><GameIcon name="smile" /></button>
        <textarea ref={input} aria-label="メッセージ" placeholder={ready ? 'タップして入力' : linked ? '接続中…' : '再接続中…'} rows={1} wrap="off" maxLength={MAX_ROOM_CHAT_LENGTH * 2} value={draft} readOnly={sending} onChange={event => setDraft(Array.from(event.target.value).slice(0, MAX_ROOM_CHAT_LENGTH).join(''))} onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault(); void submit();
        }} />
        <button type="submit" disabled={!ready || !draft.trim() || sending} aria-label="メッセージを送信">送信</button>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </OrnateFrame>}
    <button type="button" className={styles.toggle} onClick={open ? close : show} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-keyshortcuts="T" aria-label="ルームチャット" aria-describedby={unread ? unreadId : undefined} title="チャット（T）"><GameIcon name="chat" />{unread > 0 && <span id={unreadId} className={styles.badge} role="status" aria-label={`未読${unread}件`}>{unread > 99 ? '99+' : unread}</span>}</button>
  </aside>;
}
