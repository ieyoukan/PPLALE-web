'use client';

import { ROOM_CHAT_STAMPS } from '@pplale/game-core/room';
import type { RoomChatStampId } from '@pplale/game-core/room';
import { ChatStamp } from '@/components/shared/chat/ChatStamp';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomChat.module.css';

export function ChatStampPicker({ disabled, onChoose }: { disabled: boolean; onChoose: (id: RoomChatStampId) => Promise<void> }) {
  const { t } = useI18n();
  return <OrnateFrame as="div" size="sm" appearance="panel" className={styles.stamps} role="region" aria-label={t('スタンプ一覧')}>
    <div className={styles.stampList} role="group" aria-label={t('スタンプの選択')}>
      {ROOM_CHAT_STAMPS.map(stamp => <button key={stamp.id} type="button" disabled={disabled} onClick={() => void onChoose(stamp.id)} aria-label={t('{stamp}を送信', { stamp: t(stamp.label) })}>
        <ChatStamp id={stamp.id} />
      </button>)}
    </div>
  </OrnateFrame>;
}
