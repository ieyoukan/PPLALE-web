'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Deck, MatchRules } from '@pplale/game-core';
import { ROOM_PLAY_PATH } from '@/lib/game/sessionStore';
import { localMatchCardIds, roomMatchCardIds } from '@/lib/game/matchAssets';
import { useMatchPreparation } from '../MatchPreparation';

export function useRoomPreparation(deck: Deck | null, rules?: MatchRules) {
  const { prefetch } = useRouter();
  const preparation = useMatchPreparation();
  const ids = (deck ? localMatchCardIds([deck], rules) : roomMatchCardIds(rules)).join('|');
  useEffect(() => {
    prefetch(ROOM_PLAY_PATH);
    if (!ids) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void import('@/lib/game/prepareMatch').then(({ prepareMatchAssets }) => prepareMatchAssets(ids.split('|'), { signal: controller.signal })).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ids, prefetch]);
  return { ...preparation, prepare: () => preparation.prepare(ids.split('|')) };
}
