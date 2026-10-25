import PuzzleLobby from '@/components/game/puzzles/PuzzleLobby';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/puzzles/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="puzzles"><PuzzleLobby /></RoomWindow>;
}
