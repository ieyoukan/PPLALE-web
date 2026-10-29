'use client';

// 旧2席ルームの準備・対戦・観戦を表示する。盤面は共通部品で描き、進行はサーバーの状態に従う。
import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GameState, Side } from '@pplale/game-core';
import type { RoomView } from '@pplale/game-core/room';
import { BATTLE_PATH } from '@/lib/game/sessionStore';
import { BoardTable } from '../BoardEmulator';
import { useWatchingPresence } from '../social/useWatchingPresence';
import { useRoom } from './useRoom';
import type { Room } from './useRoom';
import { useRoomSession } from './useRoomSession';
import styles from '../BoardEmulator.module.css';
import link from './Room.module.css';
import { MatchAssetGate } from '../MatchPreparation';
import { roomMatchCardIds } from '@/lib/game/matchAssets';
import { RoomLobby } from './RoomLobby';

type Played = RoomView & { game: GameState };

export default function RoomBoard({ id, watch = false }: { id: string; watch?: boolean }) {
  const room = useRoom(id, watch);
  const { stage, view, linked, error } = room;
  // For a player, anything that is not a match (no seat, still choosing decks, room gone) is the room's lobby.
  const elsewhere = !watch && (stage === 'gone' || stage === 'visitor' || stage === 'seated' && !view?.game);
  // Friends see a signed-in spectator in this room while a match can be watched.
  useWatchingPresence(watch && stage === 'seated' && view?.game ? id : null);
  // A spectator stays here between matches, and is told when there is nothing to watch.
  if (watch && (stage === 'gone' || view && !view.game)) return <Waiting view={stage === 'gone' ? null : view} reason={error} />;
  if (elsewhere) return <div className={link.standalone}><RoomLobby room={room} /></div>;
  if (stage !== 'seated' || !view?.game) return <div className={styles.emulator} aria-busy="true" />;
  // What the table cannot show by itself: a connection that dropped, and who is looking on.
  const away = view.players.flatMap((player, seat) => player && !player.online && (watch || seat !== view.seat) ? [watch ? player.name : '相手'] : []);
  const trouble = !linked ? 'ルームサーバーに再接続しています…' : away.length && view.status === 'playing' ? `${away.join('・')}の接続が切れています（戻るのを待っています）` : null;
  return <MatchAssetGate ids={roomMatchCardIds(view.rules)}>
    {watch && <aside className={link.spectatorTools} aria-label="観戦メニュー">
      <Link href={BATTLE_PATH}>観戦を終了</Link>
      {view.status === 'finished' && view.replayId && <Link href={`/game/replay/?id=${view.replayId}`}>リプレイを見る ▶</Link>}
    </aside>}
    {!watch && view.status === 'finished' && view.replayId && <aside className={link.spectatorTools}><Link href={`/game/replay/?id=${view.replayId}`}>リプレイを見る ▶</Link></aside>}
    {/* A new match is a new table. */}
    <Table key={view.match} room={room} initial={view as Played} seat={view.seat} />
    {trouble ? <p className={linked ? link.badge : `${link.badge} ${link.badgeDown}`} role="status">{trouble}</p>
      : (watch || view.spectators > 0) && <p className={`${link.badge} ${link.badgeQuiet}`} role="status">{watch ? '観戦中' : '観戦'} {view.spectators}人</p>}
  </MatchAssetGate>;
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
