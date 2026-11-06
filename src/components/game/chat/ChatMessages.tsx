'use client';

import type { RefObject, UIEventHandler } from 'react';
import type { RoomChatMessage } from '@pplale/game-core/room';
import { Avatar } from '@/components/shared/player/Avatar';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { ChatStamp } from '@/components/shared/chat/ChatStamp';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomChat.module.css';

/**
 * 自分は右、相手は左。スタンプと文字は同じ発言者表示を使う。自分の発言は、ほかの誰かが読んだら「既読」を添える
 * （人数は出さない）。`reads`: メンバーごとの読んだ最後の発言（既読対応サーバー）。
 */
export function ChatMessages({ messages, ownMemberId, reads, members = [], logRef, onScroll }: {
  messages: RoomChatMessage[];
  ownMemberId?: string;
  reads?: Record<string, string>;
  /** The members in the room now: only their reads are counted. */
  members?: string[];
  logRef: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
}) {
  const { t, locale } = useI18n();
  const profiles = useProfiles(messages.map(message => message.profileId));
  const others = members.filter(member => member !== ownMemberId);
  const position = new Map(messages.map((message, index) => [message.id, index]));
  const isRead = (index: number) => !!reads && others.some(member => (position.get(reads[member] ?? '') ?? -1) >= index);

  return <div ref={logRef} role="log" aria-label={t('チャットのメッセージ')} aria-live="polite" aria-relevant="additions" className={styles.log} onScroll={onScroll}>
    {messages.map((message, index) => {
      const own = message.member === ownMemberId, read = own && isRead(index);
      return <div key={message.id} className={styles.message} data-own={own || undefined}>
      <Avatar card={message.profileId ? profiles[message.profileId]?.iconCardId : guestIcon(message.member)} size={48} />
      <div className={styles.content}>
        <div className={styles.byline}>
          <strong title={message.name}>{message.name}</strong>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {new Date(message.sentAt).toLocaleTimeString(locale === 'en' ? 'en-US' : 'ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </time>
          {read && <span className={styles.read}>{t('既読')}</span>}
        </div>
        {message.stamp ? <ChatStamp id={message.stamp} /> : <p>{message.text}</p>}
      </div>
    </div>;
    })}
  </div>;
}
