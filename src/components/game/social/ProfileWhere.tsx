'use client';

import { useEffect, useState } from 'react';
import type { ProfileLocation } from '@pplale/game-core/room';
import { readProfileLocation } from '@/lib/game/room/client';
import { usePlaza } from '../plaza/PlazaProvider';
import { PlazaIcon } from '../plaza/PlazaIcon';
import { RoomThumbnailImage } from '../plaza/RoomThumbnailImage';
import { visibilityInfo } from '../plaza/visibility';
import { AskToEnter } from './AskToEnter';
import { RoomCard } from './RoomCard';
import styles from './Social.module.css';

/** Unavailable locations display offline and never retain a stale join/request action. */
export function ProfileWhere({ uid, name, mine, canRead }: { uid: string; name: string; mine: boolean; canRead: boolean }) {
  const plaza = usePlaza();
  const own = mine && plaza.linked ? plaza.view?.plaza : undefined;
  const ownId = own ? plaza.id : null;
  const [location, setLocation] = useState<ProfileLocation>({ kind: 'offline' });
  useEffect(() => {
    if (!canRead || ownId) { setLocation({ kind: 'offline' }); return; }
    let current = true, pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try { const next = await readProfileLocation(uid); if (current) setLocation(next); }
      catch { if (current) setLocation({ kind: 'offline' }); }
      finally { pending = false; }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    const visible = () => void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [uid, canRead, ownId]);
  const shown: ProfileLocation = canRead ? location : { kind: 'offline' };
  return <section className={styles.where} aria-label="いまいるルーム">
    <h3 data-ui-title><PlazaIcon name="pin" />いまいるルーム</h3>
    {own && plaza.view ? <>
      <RoomThumbnailImage rules={own.nextRules ?? plaza.view.rules} className={styles.ownRoomImage} sizes="320px" />
      <div className={styles.profileLocation}><PlazaIcon name={visibilityInfo[own.visibility].icon} /><span><b data-ui-title>{own.name}</b><small>{visibilityInfo[own.visibility].label}</small></span></div>
    </> : shown.kind === 'room' ? <RoomCard room={shown.room} large />
      : <div className={styles.profileLocation} data-offline={shown.kind === 'offline' || undefined}>
        <PlazaIcon name={shown.kind === 'offline' ? 'people' : 'letter'} />
        <span><b data-ui-title>{shown.kind === 'offline' ? 'オフライン' : 'プライベートルーム'}</b>{shown.kind === 'private' && <small>{visibilityInfo[shown.visibility].label}</small>}</span>
      </div>}
    {!mine && canRead && shown.kind === 'private' && <AskToEnter key={`${uid}:${shown.visibility}`} uid={uid} name={name} />}
  </section>;
}
