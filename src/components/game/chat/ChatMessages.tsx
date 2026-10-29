'use client';

import type { RefObject, UIEventHandler } from 'react';
import type { RoomChatMessage } from '@pplale/game-core/room';
import { Avatar } from '@/components/shared/player/Avatar';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { ChatStamp } from '@/components/shared/chat/ChatStamp';
import styles from './RoomChat.module.css';

/** 自分は右、相手は左。スタンプと文字は同じ発言者表示を使う。 */
export function ChatMessages({ messages, ownMemberId, logRef, onScroll }: {
  messages: RoomChatMessage[];
  ownMemberId?: string;
  logRef: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
}) {
  const profiles = useProfiles(messages.map(message => message.profileId));

  return <div ref={logRef} role="log" aria-label="チャットのメッセージ" aria-live="polite" aria-relevant="additions" className={styles.log} onScroll={onScroll}>
    {messages.map(message => <div key={message.id} className={styles.message} data-own={message.member === ownMemberId || undefined}>
      <Avatar card={message.profileId ? profiles[message.profileId]?.iconCardId : guestIcon(message.member)} size={48} />
      <div className={styles.content}>
        <div className={styles.byline}>
          <strong title={message.name}>{message.name}</strong>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {new Date(message.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        {message.stamp ? <ChatStamp id={message.stamp} /> : <p>{message.text}</p>}
      </div>
    </div>)}
  </div>;
}
