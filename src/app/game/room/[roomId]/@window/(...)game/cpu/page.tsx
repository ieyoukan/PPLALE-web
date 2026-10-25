import GameLobby from '@/components/game/GameLobby';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/cpu/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="cpu"><GameLobby /></RoomWindow>;
}
