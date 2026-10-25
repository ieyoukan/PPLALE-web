import { CardsMenu } from '@/components/game/home/CardsMenu';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/cards/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="cards"><CardsMenu /></RoomWindow>;
}
