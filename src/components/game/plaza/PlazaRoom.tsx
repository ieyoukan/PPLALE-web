'use client';

// The room this player is in, whatever it is doing: its table between matches, the board during
// one (everyone not seated watches it, without the hidden cards), and the result of a finished
// match until each person goes back to the table themselves.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { GameState } from '@pplale/game-core';
import type { RoomView } from '@pplale/game-core/room';
import { roomMatchCardIds } from '@/lib/game/matchAssets';
import { BoardTable } from '../BoardEmulator';
import { MatchAssetGate } from '../MatchPreparation';
import { useRoomSession } from '../room/useRoomSession';
import boardStyles from '../BoardEmulator.module.css';
import link from '../room/Room.module.css';
import { PlazaIcon } from './PlazaIcon';
import { PlazaTable } from './PlazaTable';
import { usePlaza } from './PlazaProvider';
import styles from './Plaza.module.css';

type Played = RoomView & { game: GameState };

export function PlazaRoom({ view, onMenu }: { view: RoomView; onMenu: () => void }) {
  // A finished match stays on this screen (even once the table is back) until this person leaves it.
  const [result, setResult] = useState<Played | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (view.game && view.status === 'finished') setResult(view as Played);
    else if (view.status === 'playing') setResult(null);
  }, [view]);
  const current = view.game && (view.status === 'playing' || view.status === 'finished') ? view as Played : result;
  const shown = current && !(current.status === 'finished' && current.matchId === dismissed) ? current : null;
  const done = useCallback(() => setDismissed(shown?.matchId ?? null), [shown?.matchId]);
  // Those in the room see its name on the tab (the shared link's title only says what the link may).
  const name = view.plaza?.name;
  useEffect(() => { if (name) document.title = `${name}｜ぷぷりえーる`; }, [name]);
  if (!shown) return <PlazaTable view={view} onMenu={onMenu} />;
  return <MatchAssetGate ids={roomMatchCardIds(shown.rules)}>
    {/* A new match, or sitting down or standing up, is another table. */}
    <PlazaMatch key={`${shown.match}:${shown.watching ? 'watch' : shown.seat}`} initial={shown} onDone={done} onMenu={onMenu} />
  </MatchAssetGate>;
}

function PlazaMatch({ initial, onDone, onMenu }: { initial: Played; onDone: () => void; onMenu: () => void }) {
  const plaza = usePlaza(), { send, subscribe, linked, presented, view } = plaza;
  const room = useMemo(() => ({ send, subscribe, linked, presented }), [send, subscribe, linked, presented]);
  const seated = !initial.watching;
  // After the match: a player who leaves the result gives up the seat; one who plays again keeps it.
  const onLeave = useCallback(() => { if (seated) void send({ action: 'stand' }).catch(() => {}); onDone(); }, [seated, send, onDone]);
  const rematch = useCallback(() => { void send({ action: 'rematch' }).catch(() => {}); onDone(); }, [send, onDone]);
  const options = useMemo(() => ({ rematch, menu: onMenu }), [rematch, onMenu]);
  const session = useRoomSession({ room, initial, seat: initial.seat, onLeave, plaza: options });
  const people = view?.plaza?.members.filter(member => member.online).length ?? 0;
  // The players of a finished match may watch it again (its recording is theirs).
  const replay = view?.status === 'finished' && view.matchId === initial.matchId ? view.replayId : undefined;
  return <>
    <BoardTable session={session} />
    {replay && <aside className={link.spectatorTools}><Link href={`/game/replay/?id=${replay}`}>リプレイを見る ▶</Link></aside>}
    {/* On the board's right rail, where nothing of the match is: the room and the game's menu. */}
    <button className={`${boardStyles.infoButton} ${styles.roomTool}`} aria-label={`ルーム（${people}人）`} onClick={onMenu}>
      <PlazaIcon name="people" /><small>ルーム</small><b aria-hidden="true">{people}</b>
    </button>
    {!linked && <p className={`${link.badge} ${link.badgeDown}`} role="status">ルームサーバーに再接続しています…</p>}
  </>;
}
