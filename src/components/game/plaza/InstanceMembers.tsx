'use client';

import type { PlazaMember, PlazaView } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import type { SocialPlayer } from '@/lib/game/social';
import { useSocial } from '../social/useSocial';
import { Avatar } from '@/components/shared/player/Avatar';
import { ProfileLink } from '@/components/shared/player/ProfileLink';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { guestIcon, useProfiles } from '@/components/shared/player/useProfiles';
import { useI18n } from '@/i18n/LocaleProvider';
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
  const { t, nameText } = useI18n();
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
        <b>{nameText(member.name)}</b>
        <span className={styles.state}>
          {member.id === room.owner && <span role="img" aria-label={t('オーナー')}><GameIcon name="crown" /></span>}
          <GameIcon name={member.seat !== undefined ? 'seat' : 'eye'} />
          <small>{t(!member.online ? '再接続中' : member.seat !== undefined ? '席にいる' : '観戦')}</small>
        </span>
      </>;
      return <li key={member.id} data-away={!member.online || undefined}>
        <ProfileLink self={member.id === room.me} profileId={member.profileId} className={styles.person} label={member.id === room.me ? t('自分のプロフィール') : t('{name}のプロフィール', { name: member.name })}>{content}</ProfileLink>
      </li>;
    })}</ul>
  </section>;
  return <div className={styles.groups} role="region" aria-label={t('ルームにいるユーザー')}>
    {group(t('あなた'), self)}
    {checking ? <p role="status">{t('フレンドを確認しています…')}</p> : error ? <><p role="status">{t('フレンドを確認できませんでした')}</p>{group(t('ルームにいる人'), others)}</>
      : <>{group(t('フレンド'), others.filter(isFriend))}{group(t('ほかの人'), others.filter(member => !isFriend(member)))}</>}
  </div>;
}
