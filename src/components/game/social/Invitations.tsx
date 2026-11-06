'use client';

// 名前で招待されたルームを表示する。画面を開いている間だけ取得し、招待がなければ表示しない。
import { useEffect, useState } from 'react';
import type { RoomInfo } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { readInvitations, roomServerUrl } from '@/lib/game/room/client';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import { usePlaza } from '../plaza/PlazaProvider';
import { RoomCard } from './RoomCard';
import styles from './Social.module.css';
import own from './RoomCard.module.css';

export function Invitations() {
  const { user } = useAuth(), { id: here } = usePlaza(), { t } = useI18n();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  useEffect(() => {
    if (!user || !roomServerUrl) return;
    let current = true;
    const ask = () => { if (!document.hidden) void readInvitations().then(result => { if (current) setRooms(result.rooms); }, () => {}); };
    ask();
    const timer = setInterval(ask, 30_000);
    document.addEventListener('visibilitychange', ask);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', ask); };
  }, [user]);
  const shown = rooms.filter(room => room.id !== here);
  if (!shown.length) return null;
  return <section className={own.invited} aria-label={t('招待が届いています')}>
    <h3><GameIcon name="letter" />{t('招待が届いています')}</h3>
    <div className={styles.tiles}>{shown.map(room => <RoomCard key={room.id} room={room} />)}</div>
  </section>;
}
