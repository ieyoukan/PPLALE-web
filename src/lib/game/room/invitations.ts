import { invitedVisibility } from '@pplale/game-core/room';
import type { PlazaView } from '@pplale/game-core/room';

/** Client-side affordances only; the room server always checks the actual permission again. */
export function canShareRoomLink(room: PlazaView): boolean {
  return !invitedVisibility(room.visibility) || !!room.invite;
}

/** A friends-only room may send named invitations only as its creator. */
export function canInviteFriends(room: PlazaView, viewerId: string | undefined): boolean {
  return !!viewerId && canShareRoomLink(room) && (room.visibility !== 'friends' || room.creator.profileId === viewerId);
}
