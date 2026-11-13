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
import { useChatArrivals } from './useChatArrivals';
import { ChatPreview } from './ChatPreview';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomChat.module.css';

/** チャットの配置・開閉・スクロール・キー操作だけを管理する。送信と未読の判定は各フックへ任せる。 */
export function RoomChatPanel({ open, onOpen, onClose }: { open: boolean; onOpen(): void; onClose(): void }) {
  const { id: roomId, chat, chatReads, view, send, linked } = usePlaza();
  const { t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const nearEnd = useRef(true);
  const panelId = useId();
  const [stampsOpen, setStampsOpen] = useState(false);
  const ownMemberId = view?.plaza?.me;
  const ready = linked && !!view?.plaza?.chatEnabled;
  const stampsReady = ready && !!view?.plaza?.chatStamps;
  // A new message from someone else while the chat is closed (or the tab hidden): the count, a bubble, a sound, an OS notice.
  const { unread, preview, clearPreview } = useChatArrivals(chat, ownMemberId, open, roomId);
  const receipts = !!view?.plaza?.chatReceipts;

  // 既読: reading the open chat in a shown tab marks the newest message of the others as read.
  const lastOthers = [...chat].reverse().find(message => message.member !== ownMemberId);
  const readSent = useRef<string | null>(null);
  const ownRead = ownMemberId ? chatReads[ownMemberId] : undefined;
  useEffect(() => {
    if (!open || !ready || !receipts || !lastOthers) return;
    const mark = () => {
      if (document.hidden || ownRead === lastOthers.id || readSent.current === lastOthers.id) return;
      readSent.current = lastOthers.id;
      send({ action: 'chatRead', id: lastOthers.id }).catch(() => { readSent.current = null; });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [open, ready, receipts, lastOthers, ownRead, send]);
  const sender = useChatSender(send, ready, stampsReady);
  const unreadId = `${panelId}-unread`;

  const show = () => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    clearPreview();
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

  return <aside className={styles.chat} aria-label={t('ルーム内チャット')} data-room-chat>
    {open && <OrnateFrame as="section" appearance="panel" size="sm" className={styles.panel} id={panelId} aria-label={t('いまのルームの会話')}>
      <ChatMessages messages={chat} ownMemberId={ownMemberId} reads={receipts ? chatReads : undefined} members={view?.plaza?.members.map(member => member.id) ?? []} logRef={log} onScroll={event => {
        const box = event.currentTarget;
        nearEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      }} />
      {stampsOpen && <ChatStampPicker disabled={!stampsReady || sender.sending} onChoose={sendStamp} />}
      <ChatComposer inputRef={input} draft={sender.draft} error={sender.error} sending={sender.sending} ready={ready} linked={linked}
        stampsReady={stampsReady} stampsOpen={stampsOpen} onDraftChange={sender.setDraft}
        onToggleStamps={() => setStampsOpen(value => !value)} onSubmit={sendText} />
    </OrnateFrame>}
    {!open && preview && <ChatPreview message={preview} onOpen={show} />}
    <button type="button" className={styles.toggle} onClick={open ? close : show} aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-keyshortcuts="T" aria-label={t('ルームチャット')} aria-describedby={unread ? unreadId : undefined} title={t('チャット（T）')}>
      <GameIcon name="chat" />
      {unread > 0 && <span id={unreadId} className={styles.badge} role="status" aria-label={t('未読{count}件', { count: unread })}>{unread > 99 ? '99+' : unread}</span>}
    </button>
  </aside>;
}
