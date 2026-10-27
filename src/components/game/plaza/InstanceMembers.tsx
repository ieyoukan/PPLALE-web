'use client';

import Link from 'next/link';
import type { PlazaMember, PlazaView } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import type { SocialPlayer } from '@/lib/game/social';
import { useSocial } from '../social/useSocial';
import { Avatar } from '@/components/shared/player/Avatar';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import styles from './InstanceMembers.module.css';

/** Friendships are subscribed only while this tab is open; guests need no social subscription. */
export function InstanceMembers({ room }: { room: PlazaView }) {
  const { user } = useAuth();
  return user ? <WithFriends key={user.uid} uid={user.uid} room={room} /> : <Members room={room} />;
}

function WithFriends({ uid, room }: { uid: string; room: PlazaView }) {
  const { friends, loading, error } = useSocial(uid);
  return <Members room={room} friends={friends} checking={loading} error={error} />;
}

function Members({ room, friends = [], checking = false, error = '' }: { room: PlazaView; friends?: SocialPlayer[]; checking?: boolean; error?: string }) {
  const profiles = useProfiles(room.members.map(member => member.profileId));
  const friendIds = new Set(friends.map(friend => friend.profile.uid));
  const self = room.members.filter(member => member.id === room.me);
  const others = room.members.filter(member => member.id !== room.me);
  const isFriend = (member: PlazaMember) => !!member.profileId && friendIds.has(member.profileId);
  const group = (label: string, members: PlazaMember[]) => <section className={styles.group} aria-label={label}>
    <h3 data-ui-title>{label}<small>{members.length}</small></h3>
    <ul className={styles.members}>{members.map(member => {
      const profile = member.profileId ? profiles[member.profileId] : undefined;
      const content = <>
        <Avatar card={profile?.iconCardId ?? guestIcon(member.id)} size={56} dim={!member.online} />
        <b>{member.name}</b>
        <span className={styles.state}>
          {member.id === room.owner && <span role="img" aria-label="オーナー"><GameIcon name="crown" /></span>}
          <GameIcon name={member.seat !== undefined ? 'seat' : 'eye'} />
          <small>{!member.online ? '再接続中' : member.seat !== undefined ? '席にいる' : '観戦'}</small>
        </span>
      </>;
      return <li key={member.id} data-away={!member.online || undefined}>
        {member.profileId ? <Link className={styles.person} prefetch={false} href={`/game/profile/?id=${encodeURIComponent(member.profileId)}`}>{content}</Link>
          : <span className={styles.person}>{content}</span>}
      </li>;
    })}</ul>
  </section>;
  return <div className={styles.groups} role="region" aria-label="ルームにいるユーザー">
    {group('あなた', self)}
    {checking ? <p role="status">フレンドを確認しています…</p> : error ? <><p role="status">フレンドを確認できませんでした</p>{group('ルームにいる人', others)}</>
      : <>{group('フレンド', others.filter(isFriend))}{group('ほかの人', others.filter(member => !isFriend(member)))}</>}
  </div>;
}
