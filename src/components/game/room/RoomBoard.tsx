'use client';

// The board of a room's match. The room is followed here; the table itself is the same one the
// matches in this browser use, playing on what the server sends.
import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GameState, Side } from '@pplale/game-core';
import type { RoomView } from '@pplale/game-core/room';
import { BATTLE_PATH, ROOM_PATH, roomHref } from '@/lib/game/sessionStore';
import { BoardTable } from '../BoardEmulator';
import { useRoom } from './useRoom';
import type { Room } from './useRoom';
import { useRoomSession } from './useRoomSession';
import styles from '../BoardEmulator.module.css';
import link from './Room.module.css';

export default function RoomBoard() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const room = useRoom(id);
  const { stage, view, linked } = room;
  // Anything that is not a match (no seat, still choosing decks, room gone) belongs to the room's page.
  const elsewhere = stage === 'gone' || stage === 'visitor' || stage === 'seated' && !view?.game;
  useEffect(() => { if (elsewhere) router.replace(id ? roomHref(ROOM_PATH, id) : BATTLE_PATH); }, [elsewhere, id, router]);
  if (stage !== 'seated' || !view?.game) return <div className={styles.emulator} aria-busy="true" />;
  // What the table cannot show by itself: a connection that dropped, on this side or the other.
  const foe = view.players[view.seat === 0 ? 1 : 0];
  const trouble = !linked ? 'ルームサーバーに再接続しています…' : foe && !foe.online && view.status === 'playing' ? '相手の接続が切れています（戻るのを待っています）' : null;
  return <>
    <Table room={room} initial={view as RoomView & { game: GameState }} seat={view.seat} />
    {trouble && <p className={linked ? link.badge : `${link.badge} ${link.badgeDown}`} role="status">{trouble}</p>}
  </>;
}

function Table({ room, initial, seat }: { room: Room; initial: RoomView & { game: GameState }; seat: Side }) {
  const router = useRouter();
  const { leave } = room;
  const onLeave = useCallback(() => { void leave().then(() => router.push(BATTLE_PATH)); }, [leave, router]);
  const session = useRoomSession({ room, initial, seat, onLeave });
  return <BoardTable session={session} />;
}
