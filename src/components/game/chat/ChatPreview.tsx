'use client';

// 閉じたチャットの上に、届いた発言を吹き出しで少しのあいだ出す。押すとチャットを開く。
import type { RoomChatMessage } from '@pplale/game-core/room';
import { Avatar } from '@/components/shared/player/Avatar';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { ChatStamp } from '@/components/shared/chat/ChatStamp';
import { useI18n } from '@/i18n/LocaleProvider';
import { PREVIEW_MS } from './useChatArrivals';
import styles from './RoomChat.module.css';

export function ChatPreview({ message, onOpen }: { message: RoomChatMessage; onOpen(): void }) {
  const { t } = useI18n();
  const profiles = useProfiles([message.profileId]);
  return <button key={message.id} type="button" className={styles.preview} style={{ animationDuration: `${PREVIEW_MS}ms` }} onClick={onOpen}
    aria-label={t('{name}の新しいメッセージ。チャットを開く', { name: message.name })}>
    <Avatar card={message.profileId ? profiles[message.profileId]?.iconCardId : guestIcon(message.member)} size={32} />
    <span className={styles.previewBody}>
      <b>{message.name}</b>
      {message.stamp ? <span className={styles.previewStamp}><ChatStamp id={message.stamp} /></span> : <span className={styles.previewText}>{message.text}</span>}
    </span>
  </button>;
}
