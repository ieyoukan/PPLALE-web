'use client';

import { useRef, useState } from 'react';
import type { RoomAction, RoomChatStampId } from '@pplale/game-core/room';

type ChatContent = { text: string; stamp?: never } | { stamp: RoomChatStampId; text?: never };
type PendingMessage = ChatContent & { messageId: string };

/** 文字とスタンプの送信状態を共用する。同じ内容の再試行では送信IDを維持する。 */
export function useChatSender(send: (action: RoomAction) => Promise<void>, ready: boolean, stampsReady: boolean) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const pending = useRef<PendingMessage | null>(null);

  const submit = async (content: ChatContent): Promise<boolean> => {
    if (busy.current || !ready) return false;
    if (content.stamp ? !stampsReady : !content.text.trim()) return false;

    busy.current = true;
    setSending(true);
    setError('');

    const sameMessage = pending.current?.text === content.text && pending.current?.stamp === content.stamp;
    if (!pending.current || !sameMessage) {
      pending.current = { ...content, messageId: crypto.randomUUID() };
    }

    try {
      await send({ action: 'chat', ...pending.current });
      pending.current = null;
      if (!content.stamp) setDraft('');
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '送信できませんでした');
      return false;
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  return { draft, setDraft, error, sending, submit };
}
