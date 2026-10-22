'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Command, GameState, Side } from '@pplale/game-core';
import type { BoardSession, Incoming, RemoteSession } from '../board/useGameSession';
import { withoutEditor } from '../board/useGameSession';
import type { RoomCommand, RoomView } from '@pplale/game-core/room';
import type { Room } from './useRoom';
import { appendRoomAssessment, readRoomAssessment, saveRoomAssessment } from './roomAssessment';
import type { AssessedPoint } from '../board/assess';

type Played = RoomView & { game: GameState };
const played = (view: RoomView): view is Played => !!view.game;
const nothing = () => {};
const clockOf = (view: Played): RemoteSession['turnClock'] =>
  view.turnClock && view.rules.turnSeconds ? { ...view.turnClock, serverNow: view.serverNow ?? Date.now(), receivedAt: performance.now(), limitMs: view.rules.turnSeconds * 1000 } : undefined;

/** The view on the table, and the ones that arrived after it (oldest first). */
type Table = { shown: Played; queue: Played[]; assessment: AssessedPoint[] };
function reducer(table: Table, action: Played | 'accept'): Table {
  if (action !== 'accept') return { ...table, queue: [...table.queue, action] };
  const next = table.queue[0];
  if (!next) return table;
  return { shown: next, queue: table.queue.slice(1), assessment: appendRoomAssessment(next.match === table.shown.match ? table.assessment : [], next) };
}

/**
 * A room's match as the board plays it. Nothing is decided here: a command goes to the server, and
 * the view it (or the other side's command) leads to waits in a queue until the board has shown it.
 */
export function useRoomSession({ room, initial, seat, onLeave, onFindNext }: { room: Pick<Room, 'send' | 'subscribe' | 'linked'>; initial: Played; seat: Side; onLeave: () => void; onFindNext?: () => void }): BoardSession {
  const watching = !!initial.watching;
  const { send: request, subscribe, linked } = room;
  const [{ shown, queue, assessment }, dispatch] = useReducer(reducer, initial, view => ({ shown: view, queue: [], assessment: readRoomAssessment(view) }));
  useEffect(() => saveRoomAssessment({ matchId: shown.matchId }, assessment), [shown.matchId, assessment]);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState('');
  const [turnClock, setTurnClock] = useState(() => clockOf(initial));
  useEffect(() => subscribe(view => {
    if (played(view)) { dispatch(view); setTurnClock(clockOf(view)); }
  }), [subscribe]);

  const head = queue[0];
  const next = useMemo<Incoming | null>(() => head ? {
    key: `${head.match}:${head.version}`, game: head.game, command: head.last?.command ?? null, cardId: head.last?.cardId, fresh: head.match !== shown.match,
  } : null, [head, shown.match]);
  const accept = useCallback(() => dispatch('accept'), []);

  const { revision } = shown.game;
  const send = useCallback((command: Command) => {
    if (watching || !linked || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    request({ action: 'command', command: command as RoomCommand, revision })
      .then(() => setError(''), (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : '操作を送れませんでした');
        setFailed(value => value + 1);
      })
      .finally(() => { inFlight.current = false; setSending(false); });
  }, [request, revision, watching, linked]);
  const ask = useCallback((action: 'resign' | 'rematch') => {
    request({ action }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '操作を送れませんでした'));
  }, [request]);
  const resign = useCallback(() => ask('resign'), [ask]);
  const rematch = useCallback(() => initial.mode === 'free' ? (onFindNext ?? onLeave)() : ask('rematch'), [ask, initial.mode, onFindNext, onLeave]);

  const names = useMemo<[string, string]>(() => [shown.players[0].name, shown.players[1]?.name ?? '相手'], [shown.players]);
  const remote = useMemo(() => ({ seat, watching, assessment, turnClock, ownDeck: shown.ownDeck, matchRules: shown.rules, freeMatch: initial.mode === 'free', names, sending: !linked || sending, waiting: !linked || sending || queue.length > 0, failed, next, accept, resign, resigned: shown.resigned, leave: onLeave }),
    [seat, watching, assessment, turnClock, shown.ownDeck, shown.rules, initial.mode, names, linked, sending, queue.length, failed, next, accept, resign, shown.resigned, onLeave]);
  return {
    game: shown.game, error, history: [], commands: [], mode: 'room', levels: ['normal', 'normal'], ready: true, saveError: '',
    send, undo: nothing, canUndo: false, remote,
    // Back to choosing decks together; the room page opens the board again when both are ready.
    setup: null, rematch, canRematch: !watching,
    record: null, markReported: nothing, initial: null, position: null, ...withoutEditor,
    replaying: false, startReplay: nothing, stopReplay: nothing, canReplay: false, replayNext: null, timeline: null,
  };
}
