'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomChatMessage } from '@pplale/game-core/room';

/** 初回の履歴と自分の発言は除外する。見えているタブで開いたときだけ既読にする。 */
export function useUnreadMessages(messages: RoomChatMessage[], ownMemberId: string | undefined, open: boolean) {
  const observedIds = useRef(new Set(messages.map(message => message.id)));
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const newMessages = messages.filter(message =>
      !observedIds.current.has(message.id) && message.member !== ownMemberId,
    );
    observedIds.current = new Set(messages.map(message => message.id));
    setUnread(previous => open && !document.hidden ? 0 : previous + newMessages.length);
  }, [messages, ownMemberId, open]);

  useEffect(() => {
    const markVisibleMessagesRead = () => {
      if (open && !document.hidden) setUnread(0);
    };
    document.addEventListener('visibilitychange', markVisibleMessagesRead);
    return () => document.removeEventListener('visibilitychange', markVisibleMessagesRead);
  }, [open]);

  return unread;
}
