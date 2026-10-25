import { Suspense } from 'react';
import { ProfilePage } from '@/components/game/social/ProfilePage';
import { RoomWindow } from '@/components/game/plaza/RoomWindow';

/** `/game/profile/` opened from a room: over it, in a window. */
export default function Page() {
  return <RoomWindow page="profile"><Suspense><ProfilePage /></Suspense></RoomWindow>;
}
