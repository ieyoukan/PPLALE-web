'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomRequestError, dropSeat, joinRoom, keepSeat, readRoomInfo, seatFor, sendRoomAction, watchRoom } from '@/lib/game/room/client';
import { isRoomId } from '@/lib/game/room/types';
import type { RoomAction, RoomInfo, RoomView, SeatKey } from '@/lib/game/room/types';

/** visitor: the room exists and this browser has no seat in it. gone: no such room (any more). */
export type RoomStage = 'loading' | 'visitor' | 'seated' | 'gone';

/**
 * A room as this browser knows it: its seat (kept from creating or joining), the seat's view as it
 * changes, and the requests a seated player can make. Views only ever move forward.
 */
export function useRoom(id: string | null) {
  const [stage, setStage] = useState<RoomStage>('loading');
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [key, setKey] = useState<SeatKey | null>(null);
  const [error, setError] = useState('');
  const version = useRef(0);
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
    if (key) return;
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
  }, [id, key]);
  useEffect(() => {
    if (!id || !key) return;
    return watchRoom(id, key, take, () => {
      // The seat is not valid any more: look at the room as a visitor (or find it gone).
      dropSeat(id);
      setView(null);
      setStage('loading');
      setKey(null);
    });
  }, [id, key, take]);

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
  /** Sends a request of this seat; the view it answers with is taken like any other. Throws RoomRequestError. */
  const send = useCallback(async (action: RoomAction) => {
    if (!id || !key) throw new RoomRequestError(401, 'このルームの参加者ではありません');
    take(await sendRoomAction(id, key.token, action));
  }, [id, key, take]);
  /** Every view after this call, in order. Returns how to stop. */
  const subscribe = useCallback((listener: (view: RoomView) => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  /** Leaves the room for good: gives up a match in progress and forgets the seat. */
  const leave = useCallback(async () => {
    if (!id || !key) return;
    await sendRoomAction(id, key.token, { action: 'leave' }).catch(() => {});
    dropSeat(id);
  }, [id, key]);

  return { stage, info, view, seat: key?.seat ?? null, error, join, send, subscribe, leave };
}
export type Room = ReturnType<typeof useRoom>;
