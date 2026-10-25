import { RoomEntrance } from '@/components/game/room/RoomEntrance';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/battle/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="battle"><RoomEntrance /></RoomWindow>;
}
