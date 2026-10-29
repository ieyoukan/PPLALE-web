'use client';

import type { CSSProperties } from 'react';
import { ROOM_CHAT_STAMPS } from '@pplale/game-core/room';
import type { RoomChatStampId } from '@pplale/game-core/room';
import sheet from '@/lib/game/generated/chat-stamps.json';
import styles from './ChatStamp.module.css';

/** 一覧と発言は同じシートを共有する。個別の画像URLや原画は公開しない。 */
export function ChatStamp({ id }: { id: RoomChatStampId }) {
  const stamp = ROOM_CHAT_STAMPS.find(stamp => stamp.id === id);
  const index = sheet.ids.indexOf(id);
  if (!stamp || index < 0) return null;

  const style = {
    '--stamp-avif': `url("${sheet.avif}")`,
    '--stamp-webp': `url("${sheet.webp}")`,
    backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${index % sheet.columns / Math.max(1, sheet.columns - 1) * 100}% ${Math.floor(index / sheet.columns) / Math.max(1, sheet.rows - 1) * 100}%`,
  } as CSSProperties;

  // 表示画像の完全な取得防止ではなく、通常の右クリック保存・ドラッグを抑える。
  return <span className={styles.stamp} style={style} role="img" aria-label={stamp.label} draggable={false} onContextMenu={event => event.preventDefault()} />;
}
