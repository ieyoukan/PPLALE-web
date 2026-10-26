'use client';

import { usePlaza } from '../plaza/PlazaProvider';
import { InviteFriendButton } from './InviteFriendButton';

/** A profile invites its owner to our current room; their location has a separate request action. */
export function InviteToRoom({ uid, name }: { uid: string; name: string }) {
  const { view, linked } = usePlaza();
  return <InviteFriendButton key={`${view?.id}:${uid}`} view={view} connected={linked} uid={uid} name={name} />;
}
