import { SocialPage } from '@/components/game/social/SocialPage';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/social/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="social"><SocialPage /></RoomWindow>;
}
