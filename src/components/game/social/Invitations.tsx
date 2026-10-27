'use client';

// Rooms that let this player in by name: a friend invited them, or answered their asking. Asked
// for while the screen is shown; nothing is shown without any.
import { useEffect, useState } from 'react';
import type { RoomInfo } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { readInvitations, roomServerUrl } from '@/lib/game/room/client';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from '../plaza/PlazaProvider';
import { RoomCard } from './RoomCard';
import { matchesRoomRules } from '@/lib/game/room/filters';
import type { RoomRuleFilter } from '@/lib/game/room/filters';
import styles from './Social.module.css';
import own from './RoomCard.module.css';

export function Invitations({ filter }: { filter: RoomRuleFilter }) {
  const { user } = useAuth(), { id: here } = usePlaza();
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
  const shown = rooms.filter(room => room.id !== here && matchesRoomRules(room, filter));
  if (!shown.length) return null;
  return <section className={own.invited} aria-label="招待が届いています">
    <h3><GameIcon name="letter" />招待が届いています</h3>
    <div className={styles.tiles}>{shown.map(room => <RoomCard key={room.id} room={room} />)}</div>
  </section>;
}
