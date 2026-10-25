import { GameSettings } from '@/components/game/settings/GameSettings';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/settings/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="settings"><GameSettings /></RoomWindow>;
}
