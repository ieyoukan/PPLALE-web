import EditorLobby from '@/components/game/editor/EditorLobby';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/editor/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="editor"><EditorLobby /></RoomWindow>;
}
