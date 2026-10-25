import { NotificationsPage } from '@/components/game/social/NotificationsPage';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/notifications/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="notifications"><NotificationsPage /></RoomWindow>;
}
