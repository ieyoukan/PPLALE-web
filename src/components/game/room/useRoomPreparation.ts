'use client';

import { useEffect } from 'react';
import type { Deck, MatchRules } from '@pplale/game-core';
import { localMatchCardIds, roomMatchCardIds } from '@/lib/game/matchAssets';
import { useMatchPreparation } from '../MatchPreparation';

export function useRoomPreparation(deck: Deck | null, rules?: MatchRules) {
  const preparation = useMatchPreparation();
  const ids = (deck ? localMatchCardIds([deck], rules) : roomMatchCardIds(rules)).join('|');
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void import('@/lib/game/prepareMatch').then(({ prepareMatchAssets }) => prepareMatchAssets(ids.split('|'), { signal: controller.signal })).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ids]);
  return { ...preparation, prepare: () => preparation.prepare(ids.split('|')) };
}
