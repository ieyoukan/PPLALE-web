'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { ScreenSubtitle } from '@/components/shared/ui/ScreenSubtitle';
import type { SocialPlayer } from '@/lib/game/social';
import type { RoomInfo, RoomView } from '@pplale/game-core/room';
import { lookupRooms } from '@/lib/game/room/client';
import { usePlaza } from '../plaza/PlazaProvider';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { FriendTile } from './FriendTile';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import { locate, placeLabel, placeOf, placeOrder } from './location';
import { RoomCard } from './RoomCard';
import { WATCHING_STALE } from '@/lib/game/social';
import { Invitations } from './Invitations';
import { ProfileShare } from './ProfileShare';
import { UserSearch } from './UserSearch';
import { useMyProfile } from './useMyProfile';
import { useSocial } from './useSocial';
import styles from './Social.module.css';

/** A friend in a room: its host, or someone watching it. */
interface Member { player: SocialPlayer; role: 'host' | 'watching' }
interface Group { room: RoomInfo; members: Member[] }

export function SocialPage() {
  const { user, loading, signInWithGoogle } = useAuth(), { t } = useI18n();
  if (loading) return <p role="status">{t('読み込み中…')}</p>;
  if (!user) return <section className={styles.panel} aria-label={t('ソーシャル')}><ScreenSubtitle>{t('フレンドの現在地')}</ScreenSubtitle><div className={styles.signIn}><h3 data-ui-title>{t('フレンドと遊ぼう')}</h3><p>{t('プロフィールを作って、フレンドの募集に参加しよう。')}</p><OrnateFrame as="button" size="sm" className={styles.cardButton} onClick={() => void signInWithGoogle()}><span data-ui-title>{t('ログイン')}</span></OrnateFrame></div></section>;
  return <Social key={user.uid} uid={user.uid} />;
}
function Social({ uid }: { uid: string }) {
  const me = useMyProfile(), plaza = usePlaza(), { t, nameText } = useI18n();
  const { friends, error, loading } = useSocial(uid);
  const [rooms, setRooms] = useState<Record<string, RoomInfo>>({}), [now, setNow] = useState(() => Date.now());
  const roomIds = [...new Set(friends.flatMap(player => [player.roomId, player.watching?.roomId].filter((id): id is string => !!id)))].sort().join(',');
  useEffect(() => {
    let current = true;
    async function refresh() {
      if (document.hidden) return;
      // One request for every room; the server leaves out those this player may not enter.
      const found = roomIds ? await lookupRooms(roomIds.split(',')).then(result => result.rooms, () => null) : [];
      if (current && found) { setRooms(Object.fromEntries(found.map(room => [room.id, room]))); setNow(Date.now()); }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [roomIds]);
  // The room this player is in comes first, whatever its visibility (an invited room too: they are in it).
  const here = plaza.linked && plaza.view?.plaza ? currentRoom(plaza.view) : null;
  const inHere = new Set(here ? plaza.view!.plaza!.members.flatMap(member => member.profileId && member.online ? [member.profileId] : []) : []);
  const groups = new Map<string, Group>(), elsewhere: SocialPlayer[] = [], withMe: SocialPlayer[] = [];
  for (const player of friends) {
    if (inHere.has(player.profile.uid)) { withMe.push(player); continue; }
    const found = locate(player, rooms, now);
    if (!found) { elsewhere.push(player); continue; }
    if (found.room.id === here?.id) { withMe.push(player); continue; }
    const group = groups.get(found.room.id) ?? { room: found.room, members: [] };
    group.members.push({ player, role: found.role }); groups.set(found.room.id, group);
  }
  const ordered = [...groups.values()].sort((a, b) => placeOrder.indexOf(placeOf(a.room)) - placeOrder.indexOf(placeOf(b.room)) || a.room.id.localeCompare(b.room.id));
  // Online: in a room (here or found) or said where they are lately (the presence of the last few minutes); else offline.
  const recent = (player: SocialPlayer) => !!player.watching && now - player.watching.at < WATCHING_STALE;
  const onlineElsewhere = elsewhere.filter(recent), offline = elsewhere.filter(player => !recent(player));
  const onlineCount = withMe.length + ordered.reduce((sum, group) => sum + group.members.length, 0) + onlineElsewhere.length;
  const tile = ({ profile, friendship }: SocialPlayer, place: string, status: string) => <FriendTile key={friendship.id} profile={profile} place={place} status={status} />;
  return <section className={styles.panel} aria-label={t('ソーシャル')}>
    <header className={styles.socialHeading}>
      <ScreenSubtitle suffix={t('{count}人', { count: friends.length })}>{t('フレンドの現在地')}</ScreenSubtitle>
      <span className={styles.headingLinks}>
        <Link className={styles.me} href="/game/profile/" aria-label={t('マイプロフィール')}>
          <span className={styles.avatar}>{me && <CardArtwork id={me.iconCardId} sizes="40px" />}</span><span>{me?.displayName ?? t('マイプロフィール')}</span><GameIcon name="pen" />
        </Link>
      </span>
    </header>
    {here && <details className={styles.group} data-place="here" open>
      <summary><span className={styles.chevron} aria-hidden="true" /><GameIcon name="pin" /><span data-ui-title>{nameText(here.plaza!.name)}</span><span className={styles.placeChip}>{t('いまいるルーム')}</span></summary>
      <div className={styles.groupBody}>
        <RoomCard room={here} here />
        <div className={styles.tiles}>{withMe.map(player => tile(player, 'here', t('いっしょにいます')))}</div>
      </div>
    </details>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <UserSearch />
    <Invitations />
    {!friends.length && <div className={styles.empty} role={loading ? 'status' : undefined}><p>{loading ? t('読み込み中…') : t('リンクを送って、フレンドになろう')}</p>{!loading && me && <ProfileShare uid={uid} name={me.displayName} mine />}</div>}
    {friends.length > 0 && <h3 className={styles.presenceHeading} data-presence="online"><i aria-hidden="true" /><span data-ui-title>{t('オンライン')}</span><small>{t('{count}人', { count: onlineCount })}</small></h3>}
    {ordered.map(({ room, members }) => {
      const place = placeOf(room);
      return <details key={room.id} className={styles.group} data-place={place} open>
        <summary><span className={styles.chevron} aria-hidden="true" /><span data-ui-title>{room.plaza ? nameText(room.plaza.name) : t('{name}のルーム', { name: room.host })}</span><span className={styles.placeChip}>{t(placeLabel[place])}</span></summary>
        <div className={styles.groupBody}>
          <RoomCard room={room} />
          <div className={styles.tiles}>{members.map(({ player, role }) => role === 'host' ? tile(player, place, t(placeLabel[place])) : tile(player, 'watching', t('観戦中')))}</div>
        </div>
      </details>;
    })}
    {onlineElsewhere.length > 0 && <div className={styles.tiles}>{onlineElsewhere.map(player => tile(player, 'online', t('オンライン')))}</div>}
    {offline.length > 0 && <>
      <h3 className={styles.presenceHeading} data-presence="offline"><i aria-hidden="true" /><span data-ui-title>{t('オフライン')}</span><small>{t('{count}人', { count: offline.length })}</small></h3>
      <div className={`${styles.tiles} ${styles.offline}`}>{offline.map(player => tile(player, 'away', ''))}</div>
    </>}
  </section>;
}

/** The room this player is in, described as a room card describes others (from the room's own view). */
function currentRoom(view: RoomView): RoomInfo {
  const plaza = view.plaza!;
  return {
    id: view.id, rules: plaza.nextRules ?? view.rules, host: plaza.creator.name, status: view.status, open: false, spectators: true,
    plaza: { name: plaza.name, visibility: plaza.visibility, creator: plaza.creator, members: plaza.members.filter(member => member.online).length, seated: view.players.filter(Boolean).length },
  };
}
