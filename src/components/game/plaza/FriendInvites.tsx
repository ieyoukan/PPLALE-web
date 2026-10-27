'use client';

// Inviting a friend by name: they are let into this room (even an invited one) and told by a push
// notification and on their friends screen. Only signed-in players have friends.
import type { RoomView } from '@pplale/game-core/room';
import { InviteFriendButton } from '../social/InviteFriendButton';
import { usePlaza } from './PlazaProvider';
import { useSocial } from '../social/useSocial';
import { Avatar } from '@/components/shared/player/Avatar';
import { PlazaIcon } from './PlazaIcon';
import styles from './Plaza.module.css';

export function FriendInvites({ uid, view }: { uid: string; view: RoomView }) {
  const { friends, loading } = useSocial(uid);
  const { linked } = usePlaza();
  const here = new Set(view.plaza?.members.map(member => member.profileId));
  const shown = friends.filter(friend => !here.has(friend.profile.uid)).slice(0, 30);
  if (loading || !shown.length) return null;
  return <section className={styles.friendInvites} aria-label="フレンドを招待">
    <h3><PlazaIcon name="heart" />フレンドを招待</h3>
    <ul>{shown.map(({ profile }) => <li key={profile.uid}>
      <Avatar card={profile.iconCardId} size={36} /><span>{profile.displayName}</span>
      <InviteFriendButton key={`${view.id}:${profile.uid}`} view={view} connected={linked} uid={profile.uid} name={profile.displayName} />
    </li>)}</ul>
  </section>;
}
