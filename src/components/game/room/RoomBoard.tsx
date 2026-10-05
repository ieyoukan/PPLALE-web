'use client';

// The board of a room's match, for its players and (`&watch=1`) for spectators. The room is
// followed here; the table itself is the same one the matches in this browser use, playing on
// what the server sends.
import { useCallback, useEffect } from 'react';
import Link from 'next/link';
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

type Played = RoomView & { game: GameState };

export default function RoomBoard() {
  const params = useSearchParams(), id = params.get('id'), watch = params.get('watch') === '1';
  const router = useRouter();
  const room = useRoom(id, watch);
  const { stage, view, linked, error } = room;
  // For a player, anything that is not a match (no seat, still choosing decks, room gone) belongs to the room's page.
  const elsewhere = !watch && (stage === 'gone' || stage === 'visitor' || stage === 'seated' && !view?.game);
  useEffect(() => { if (elsewhere) router.replace(id ? roomHref(ROOM_PATH, id) : BATTLE_PATH); }, [elsewhere, id, router]);
  // A spectator stays here between matches, and is told when there is nothing to watch.
  if (watch && (stage === 'gone' || view && !view.game)) return <Waiting view={stage === 'gone' ? null : view} reason={error} />;
  if (stage !== 'seated' || !view?.game) return <div className={styles.emulator} aria-busy="true" />;
  // What the table cannot show by itself: a connection that dropped, and who is looking on.
  const away = view.players.flatMap((player, seat) => player && !player.online && (watch || seat !== view.seat) ? [watch ? player.name : '相手'] : []);
  const trouble = !linked ? 'ルームサーバーに再接続しています…' : away.length && view.status === 'playing' ? `${away.join('・')}の接続が切れています（戻るのを待っています）` : null;
  return <>
    {/* A new match is a new table. */}
    <Table key={view.match} room={room} initial={view as Played} seat={view.seat} />
    {trouble ? <p className={linked ? link.badge : `${link.badge} ${link.badgeDown}`} role="status">{trouble}</p>
      : (watch || view.spectators > 0) && <p className={`${link.badge} ${link.badgeQuiet}`} role="status">{watch ? '観戦中' : '観戦'} {view.spectators}人</p>}
  </>;
}

function Table({ room, initial, seat }: { room: Room; initial: Played; seat: Side }) {
  const router = useRouter();
  const { leave } = room;
  const onLeave = useCallback(() => { void leave().then(() => router.push(BATTLE_PATH)); }, [leave, router]);
  const session = useRoomSession({ room, initial, seat, onLeave });
  return <BoardTable session={session} />;
}

/** What a spectator sees while there is no match: who is in the room, or why it cannot be watched. */
function Waiting({ view, reason }: { view: RoomView | null; reason: string }) {
  const names = view?.players.map(player => player?.name ?? '募集中').join(' vs ');
  return <div className={link.standalone}>
    <section className={link.panel} role="status">
      <h2>{!view ? '観戦できません' : view.status === 'closed' ? 'このルームは解散しました' : '対戦が始まるのを待っています'}</h2>
      <p>{!view ? reason || 'ルームが見つかりません' : view.status === 'closed' ? '観戦していたルームはなくなりました。' : `${names}　2人の準備ができると、ここで対戦が始まります。`}</p>
      <div className={link.row}><Link href={BATTLE_PATH} className={link.secondary}>バトルへ戻る</Link></div>
    </section>
  </div>;
}
