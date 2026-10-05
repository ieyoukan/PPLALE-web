'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomRequestError, connectRoom, dropSeat, joinRoom, keepSeat, readRoomInfo, seatFor } from '@/lib/game/room/client';
import type { RoomConnection } from '@/lib/game/room/client';
import { isRoomId } from '@pplale/game-core/room';
import type { RoomAction, RoomInfo, RoomView, SeatKey } from '@pplale/game-core/room';

/** visitor: the room exists and this browser has no seat in it. seated: its view is here (a spectator's too). gone: no such room (any more), or it may not be watched. */
export type RoomStage = 'loading' | 'visitor' | 'seated' | 'gone';

/**
 * A room as this browser knows it: its seat (kept from creating or joining), the seat's view as
 * the server sends it, and the requests a seated player can make. Views only ever move forward.
 * With `watch` it looks on without a seat instead (where the room allows it).
 */
export function useRoom(id: string | null, watch = false) {
  const [stage, setStage] = useState<RoomStage>('loading');
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [key, setKey] = useState<SeatKey | null>(null);
  /** The socket is up. False while connecting again after it dropped. */
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const connection = useRef<RoomConnection | null>(null);
  const listeners = useRef(new Set<(view: RoomView) => void>());
  const take = useCallback((next: RoomView) => {
    if (next.version <= version.current) return;
    version.current = next.version;
    setView(next);
    setStage('seated');
    listeners.current.forEach(listener => listener(next));
  }, []);

  // The seat this browser has, or what a visitor may know.
  useEffect(() => {
    if (!isRoomId(id)) return setStage('gone');
    if (key || watch) return;
    version.current = 0;
    const seat = seatFor(id);
    if (seat) return setKey(seat);
    let current = true;
    readRoomInfo(id).then(result => {
      if (!current) return;
      setInfo(result);
      setStage('visitor');
    }).catch((failure: unknown) => {
      if (!current) return;
      if (failure instanceof RoomRequestError && failure.status === 404) return setStage('gone');
      setError(failure instanceof Error ? failure.message : 'ルームを読み込めませんでした');
    });
    return () => { current = false; };
  }, [id, key, watch]);
  useEffect(() => {
    if (!isRoomId(id) || !key && !watch) return;
    const opened = connection.current = connectRoom(id, watch ? null : key!.token, {
      onView: take, onLink: setLinked,
      // The seat is not valid any more: look at the room as a visitor (or find it gone).
      onGone(message) {
        if (watch) {
          setError(message);
          return setStage('gone');
        }
        dropSeat(id);
        setView(null);
        setStage('loading');
        setKey(null);
      },
    });
    return () => {
      opened.close();
      if (connection.current === opened) connection.current = null;
    };
  }, [id, key, watch, take]);

  const join = useCallback(async (name: string) => {
    if (!id) return;
    setError('');
    try {
      const { view: first, ...seat } = await joinRoom(id, name);
      keepSeat(id, seat);
      setKey(seat);
      take(first);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '参加できませんでした'); }
  }, [id, take]);
  /** Sends a request of this seat; its view has arrived when this resolves. Rejects with RoomRequestError. */
  const send = useCallback((action: RoomAction) =>
    connection.current?.send(action) ?? Promise.reject(new RoomRequestError(401, 'このルームの参加者ではありません')), []);
  /** Every view after this call, in order. Returns how to stop. */
  const subscribe = useCallback((listener: (view: RoomView) => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  /** Leaves the room for good: gives up a match in progress and forgets the seat. */
  const leave = useCallback(async () => {
    if (!id) return;
    if (!watch) await connection.current?.send({ action: 'leave' }).catch(() => {});
    connection.current?.close();
    if (!watch) dropSeat(id);
  }, [id, watch]);

  return { stage, info, view, seat: key?.seat ?? null, linked, error, join, send, subscribe, leave };
}
export type Room = ReturnType<typeof useRoom>;
