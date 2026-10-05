'use client';

// The board of a room's match. The room is followed here; the table itself is the same one the
// matches in this browser use, playing on what the server sends.
import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GameState, Side } from '@pplale/game-core';
import type { RoomView } from '@/lib/game/room/types';
import { BATTLE_PATH, ROOM_PATH, roomHref } from '@/lib/game/sessionStore';
import { BoardTable } from '../BoardEmulator';
import { useRoom } from './useRoom';
import type { Room } from './useRoom';
import { useRoomSession } from './useRoomSession';
import styles from '../BoardEmulator.module.css';

export default function RoomBoard() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const room = useRoom(id);
  const { stage, view } = room;
  // Anything that is not a match (no seat, still choosing decks, room gone) belongs to the room's page.
  const elsewhere = stage === 'gone' || stage === 'visitor' || stage === 'seated' && !view?.game;
  useEffect(() => { if (elsewhere) router.replace(id ? roomHref(ROOM_PATH, id) : BATTLE_PATH); }, [elsewhere, id, router]);
  if (stage !== 'seated' || !view?.game) return <div className={styles.emulator} aria-busy="true" />;
  return <Table room={room} initial={view as RoomView & { game: GameState }} seat={view.seat} />;
}

function Table({ room, initial, seat }: { room: Room; initial: RoomView & { game: GameState }; seat: Side }) {
  const router = useRouter();
  const { leave } = room;
  const onLeave = useCallback(() => { void leave().then(() => router.push(BATTLE_PATH)); }, [leave, router]);
  const session = useRoomSession({ room, initial, seat, onLeave });
  return <BoardTable session={session} />;
}
