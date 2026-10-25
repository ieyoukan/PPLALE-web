import { FreeMatch } from '@/components/game/room/FreeMatch';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/battle/free/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="battle/free"><FreeMatch /></RoomWindow>;
}
