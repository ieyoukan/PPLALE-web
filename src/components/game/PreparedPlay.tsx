'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Deck, MatchRules } from '@pplale/game-core';
import { CPU_PATH, cpuSidesOf, readSession } from '@/lib/game/sessionStore';
import type { Mode } from '@/lib/game/sessionStore';
import { localMatchCardIds } from '@/lib/game/matchAssets';
import { MatchAssetGate } from './MatchPreparation';

const Board = dynamic(() => import('./BoardEmulator'));

export default function PreparedPlay() {
  const { replace } = useRouter();
  const [assets, setAssets] = useState<{ ids: string[]; cpu: boolean; master: boolean } | null>(null);
  useEffect(() => {
    const session = readSession();
    if (!session || !session.game || typeof session.game !== 'object') return replace(CPU_PATH);
    const setup = session.setup as { decks?: Deck[]; matchRules?: MatchRules } | undefined;
    try {
      const levels = Array.isArray(session.levels) ? session.levels : [session.level, session.level];
      const cpuSides = cpuSidesOf(session.mode as Mode);
      setAssets({ ids: localMatchCardIds(Array.isArray(setup?.decks) ? setup.decks : [], setup?.matchRules), cpu: cpuSides.length > 0, master: cpuSides.some(side => levels[side] === 'master') });
    } catch { replace(CPU_PATH); }
  }, [replace]);
  return assets && <MatchAssetGate {...assets}><Board /></MatchAssetGate>;
}
