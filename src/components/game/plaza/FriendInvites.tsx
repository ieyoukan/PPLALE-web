'use client';

// Inviting a friend by name: they are let into this room (even an invited one) and told by a push
// notification and on their friends screen. Only signed-in players have friends.
import { useState } from 'react';
import type { RoomView } from '@pplale/game-core/room';
import { inviteFriend, plazaKey } from '@/lib/game/room/client';
import { useSocial } from '../social/useSocial';
import { Avatar } from './Avatar';
import { PlazaIcon } from './PlazaIcon';
import styles from './Plaza.module.css';

export function FriendInvites({ uid, view }: { uid: string; view: RoomView }) {
  const { friends, loading } = useSocial(uid);
  const [sent, setSent] = useState<Record<string, 'busy' | 'sent' | 'failed'>>({});
  const here = new Set(view.plaza?.members.map(member => member.profileId));
  const shown = friends.filter(friend => !here.has(friend.profile.uid)).slice(0, 30);
  if (loading || !shown.length) return null;
  const invite = (profileId: string) => {
    setSent(current => ({ ...current, [profileId]: 'busy' }));
    const member = plazaKey(view.id)?.token;
    (member ? inviteFriend(view.id, member, profileId) : Promise.reject(new Error('no member'))).then(() => setSent(current => ({ ...current, [profileId]: 'sent' })), () => setSent(current => ({ ...current, [profileId]: 'failed' })));
  };
  return <section className={styles.friendInvites} aria-label="フレンドを招待">
    <h3><PlazaIcon name="heart" />フレンドを招待</h3>
    <ul>{shown.map(({ profile }) => <li key={profile.uid}>
      <Avatar card={profile.iconCardId} size={36} /><span>{profile.displayName}</span>
      <button disabled={sent[profile.uid] === 'busy' || sent[profile.uid] === 'sent'} onClick={() => invite(profile.uid)} data-state={sent[profile.uid]}>
        <PlazaIcon name={sent[profile.uid] === 'sent' ? 'check' : 'send'} />{sent[profile.uid] === 'sent' ? '招待した' : sent[profile.uid] === 'failed' ? 'もう一度' : '招待'}
      </button>
    </li>)}</ul>
  </section>;
}
