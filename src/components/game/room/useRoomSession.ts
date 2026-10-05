'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { Command, GameState, Side } from '@pplale/game-core';
import type { BoardSession, Incoming } from '../board/useGameSession';
import type { RoomCommand, RoomView } from '@pplale/game-core/room';
import type { Room } from './useRoom';

type Played = RoomView & { game: GameState };
const played = (view: RoomView): view is Played => !!view.game;
const nothing = () => {};

/** The view on the table, and the ones that arrived after it (oldest first). */
type Table = { shown: Played; queue: Played[] };
function reducer({ shown, queue }: Table, action: Played | 'accept'): Table {
  if (action !== 'accept') return { shown, queue: [...queue, action] };
  return queue.length ? { shown: queue[0], queue: queue.slice(1) } : { shown, queue };
}

/**
 * A room's match as the board plays it. Nothing is decided here: a command goes to the server, and
 * the view it (or the other side's command) leads to waits in a queue until the board has shown it.
 */
export function useRoomSession({ room, initial, seat, onLeave }: { room: Pick<Room, 'send' | 'subscribe'>; initial: Played; seat: Side; onLeave: () => void }): BoardSession {
  const { send: request, subscribe } = room;
  const [{ shown, queue }, dispatch] = useReducer(reducer, { shown: initial, queue: [] });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => subscribe(view => { if (played(view)) dispatch(view); }), [subscribe]);

  const head = queue[0];
  const next = useMemo<Incoming | null>(() => head ? {
    key: `${head.match}:${head.version}`, game: head.game, command: head.last?.command ?? null, cardId: head.last?.cardId, fresh: head.match !== shown.match,
  } : null, [head, shown.match]);
  const accept = useCallback(() => dispatch('accept'), []);

  const { revision } = shown.game;
  const send = useCallback((command: Command) => {
    setSending(true);
    request({ action: 'command', command: command as RoomCommand, revision })
      .then(() => setError(''), (failure: unknown) => setError(failure instanceof Error ? failure.message : '操作を送れませんでした'))
      .finally(() => setSending(false));
  }, [request, revision]);
  const ask = useCallback((action: 'resign' | 'rematch') => {
    request({ action }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '操作を送れませんでした'));
  }, [request]);
  const resign = useCallback(() => ask('resign'), [ask]);
  const rematch = useCallback(() => ask('rematch'), [ask]);

  const names = useMemo<[string, string]>(() => [shown.players[0].name, shown.players[1]?.name ?? '相手'], [shown.players]);
  const remote = useMemo(() => ({ seat, names, waiting: sending || queue.length > 0, next, accept, resign, resigned: shown.resigned, leave: onLeave }),
    [seat, names, sending, queue.length, next, accept, resign, shown.resigned, onLeave]);
  return {
    game: shown.game, error, history: [], commands: [], mode: 'room', levels: ['normal', 'normal'], ready: true, saveError: '',
    send, undo: nothing, canUndo: false, remote,
    // Back to choosing decks together; the room page opens the board again when both are ready.
    setup: null, rematch, canRematch: true,
    record: null, markReported: nothing,
    replaying: false, startReplay: nothing, stopReplay: nothing, canReplay: false, replayNext: null,
  };
}
