'use client';

// 他人の新しい発言を、チャットを閉じている（またはタブが裏の）間に知らせる。初回の入室履歴、自分の発言、受信済みの
// 同じ発言は数えない。未読数（開閉ボタンの赤いバッジ）、左下の吹き出し（ChatPreview、PREVIEW_MS だけ）、通知音、
// タブが裏なら許可済みのOS通知。見えているタブで開くと未読は0になる。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomChatMessage } from '@pplale/game-core/room';
import { ROOM_CHAT_STAMPS } from '@pplale/game-core/room';
import { showSystemNotice } from '@/lib/game/systemNotice';
import { useGameNotifications } from '../notifications/GameNotifications';
import { plazaHref } from '../plaza/PlazaProvider';

/** How long the bubble stays (ms); RoomChat.module.css fades it out over its last part. */
export const PREVIEW_MS = 5000;

export function useChatArrivals(messages: RoomChatMessage[], ownMemberId: string | undefined, open: boolean, roomId: string | null) {
  const observed = useRef(new Set(messages.map(message => message.id)));
  const [unread, setUnread] = useState(0);
  const [preview, setPreview] = useState<RoomChatMessage | null>(null);
  const { notify } = useGameNotifications();

  useEffect(() => {
    const arrived = messages.filter(message => !observed.current.has(message.id) && message.member !== ownMemberId);
    observed.current = new Set(messages.map(message => message.id));
    const reading = open && !document.hidden;
    setUnread(previous => reading ? 0 : previous + arrived.length);
    const latest = arrived.at(-1);
    if (!latest || reading) return;
    setPreview(latest);
    notify('chat', latest.id);
    if (document.hidden && roomId) {
      const stamp = latest.stamp && ROOM_CHAT_STAMPS.find(item => item.id === latest.stamp);
      void showSystemNotice({ title: latest.name, body: stamp ? `スタンプ：${stamp.label}` : latest.text, url: plazaHref(roomId), tag: `chat-${roomId}` });
    }
  }, [messages, ownMemberId, open, roomId, notify]);

  // Opened in a shown tab (or the tab shown again while open): read.
  useEffect(() => {
    const read = () => { if (open && !document.hidden) setUnread(0); };
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [open]);

  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [preview]);

  const clearPreview = useCallback(() => setPreview(null), []);
  return { unread, preview, clearPreview };
}
