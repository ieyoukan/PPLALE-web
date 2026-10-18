'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Deck } from '@pplale/game-core';
import { ROOM_PLAY_PATH } from '@/lib/game/sessionStore';

export function useRoomPreparation(deck: Deck | null) {
  const { prefetch } = useRouter();
  const ids = deck ? [deck.playable, ...deck.yojo, ...deck.sweet].join('|') : '';
  useEffect(() => {
    prefetch(ROOM_PLAY_PATH);
    if (!ids) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void import('@/lib/game/room/warmAssets').then(({ warmRoomCards }) => warmRoomCards(ids.split('|'), controller.signal)).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ids, prefetch]);
}
