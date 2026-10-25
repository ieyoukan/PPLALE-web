import { MatchHistory } from '@/components/game/history/MatchHistory';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/battle/history/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="battle/history"><MatchHistory /></RoomWindow>;
}
