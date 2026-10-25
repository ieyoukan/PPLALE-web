import CardGallery from '@/components/game/home/CardGallery';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/cards/zukan/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="cards/zukan"><CardGallery /></RoomWindow>;
}
