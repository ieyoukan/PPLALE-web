import Image from 'next/image';
import { ROOM_CHAT_STAMPS } from '@pplale/game-core/room';
import type { RoomChatStampId } from '@pplale/game-core/room';
import styles from './ChatStamp.module.css';

/** 一覧と発言で同じスタンプ画像を使う。登録済みの画像だけを表示し、外部URLは使わない。 */
export function ChatStamp({ id }: { id: RoomChatStampId }) {
  const stamp = ROOM_CHAT_STAMPS.find(stamp => stamp.id === id);
  return stamp ? <Image className={styles.stamp} src={`/images/chat/stamps/${stamp.id}.webp`} alt={stamp.label} width={512} height={512} unoptimized /> : null;
}
