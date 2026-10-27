'use client';

// `/game/editor/`: a shared position (`?PPL1.…`) opens straight on the board; otherwise the editor
// opens in the launchpad over the room, like the game's other screens.
import { useSearchParams } from 'next/navigation';
import { OpenInRoom } from '@/components/game/launchpad/OpenInRoom';
import EditorLobby from './EditorLobby';

export function EditorEntry() {
  return useSearchParams().toString() ? <EditorLobby /> : <OpenInRoom section="editor" />;
}
