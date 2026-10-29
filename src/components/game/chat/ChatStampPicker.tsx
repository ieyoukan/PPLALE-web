'use client';

import { ROOM_CHAT_STAMPS } from '@pplale/game-core/room';
import type { RoomChatStampId } from '@pplale/game-core/room';
import { ChatStamp } from '@/components/shared/chat/ChatStamp';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import styles from './RoomChat.module.css';

export function ChatStampPicker({ disabled, onChoose }: { disabled: boolean; onChoose: (id: RoomChatStampId) => Promise<void> }) {
  return <OrnateFrame as="div" size="sm" appearance="panel" className={styles.stamps} role="region" aria-label="スタンプ一覧">
    {ROOM_CHAT_STAMPS.map(stamp => <button key={stamp.id} type="button" disabled={disabled} onClick={() => void onChoose(stamp.id)} aria-label={`${stamp.label}を送信`}>
      <ChatStamp id={stamp.id} />
    </button>)}
  </OrnateFrame>;
}
