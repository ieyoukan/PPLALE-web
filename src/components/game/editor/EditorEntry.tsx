'use client';

// 共有盤面付きのURLは直接盤面を開く。それ以外はルーム上のランチパッドでエディタを開く。
import { useSearchParams } from 'next/navigation';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';
import EditorLobby from './EditorLobby';

export function EditorEntry() {
  return useSearchParams().toString() ? <EditorLobby /> : <OpenInRoom section="editor" />;
}
