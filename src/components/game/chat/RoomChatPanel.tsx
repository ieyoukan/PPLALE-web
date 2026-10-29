'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { RoomChatStampId } from '@pplale/game-core/room';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { usePlaza } from '../plaza/PlazaProvider';
import { ChatComposer } from './ChatComposer';
import { ChatMessages } from './ChatMessages';
import { ChatStampPicker } from './ChatStampPicker';
import { useChatSender } from './useChatSender';
import { useUnreadMessages } from './useUnreadMessages';
import styles from './RoomChat.module.css';

/** チャットの配置・開閉・スクロール・キー操作だけを管理する。送信と未読の判定は各フックへ任せる。 */
export function RoomChatPanel({ open, onOpen, onClose }: { open: boolean; onOpen(): void; onClose(): void }) {
  const { chat, view, send, linked } = usePlaza();
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const nearEnd = useRef(true);
  const panelId = useId();
  const [stampsOpen, setStampsOpen] = useState(false);
  const ownMemberId = view?.plaza?.me;
  const ready = linked && !!view?.plaza?.chatEnabled;
  const stampsReady = ready && !!view?.plaza?.chatStamps;
  const unread = useUnreadMessages(chat, ownMemberId, open);
  const sender = useChatSender(send, ready, stampsReady);
  const unreadId = `${panelId}-unread`;

  const show = () => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    onOpen();
  };
  const close = () => {
    onClose();
    if (previousFocus.current?.isConnected) previousFocus.current.focus();
  };

  // メニューより先にEscapeを処理する。入力中・変換中のTは奪わない。
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopPropagation();
        if (stampsOpen) setStampsOpen(false);
        else close();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== 't' || target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      event.preventDefault();
      if (open) input.current?.focus();
      else show();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  });

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    nearEnd.current = true;
  }, [open]);

  useEffect(() => {
    if (open && nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat, open]);

  const sendText = async () => {
    if (await sender.submit({ text: sender.draft.trim() })) nearEnd.current = true;
  };
  const sendStamp = async (stamp: RoomChatStampId) => {
    if (!await sender.submit({ stamp })) return;
    setStampsOpen(false);
    nearEnd.current = true;
  };

  return <aside className={styles.chat} aria-label="ルーム内チャット" data-room-chat>
    {open && <OrnateFrame as="section" appearance="panel" size="sm" className={styles.panel} id={panelId} aria-label="いまのルームの会話">
      <ChatMessages messages={chat} ownMemberId={ownMemberId} logRef={log} onScroll={event => {
        const box = event.currentTarget;
        nearEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      }} />
      {stampsOpen && <ChatStampPicker disabled={!stampsReady || sender.sending} onChoose={sendStamp} />}
      <ChatComposer inputRef={input} draft={sender.draft} error={sender.error} sending={sender.sending} ready={ready} linked={linked}
        stampsReady={stampsReady} stampsOpen={stampsOpen} onDraftChange={sender.setDraft}
        onToggleStamps={() => setStampsOpen(value => !value)} onSubmit={sendText} />
    </OrnateFrame>}
    <button type="button" className={styles.toggle} onClick={open ? close : show} aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-keyshortcuts="T" aria-label="ルームチャット" aria-describedby={unread ? unreadId : undefined} title="チャット（T）">
      <GameIcon name="chat" />
      {unread > 0 && <span id={unreadId} className={styles.badge} role="status" aria-label={`未読${unread}件`}>{unread > 99 ? '99+' : unread}</span>}
    </button>
  </aside>;
}
