'use client';

import { useEffect } from 'react';
import { cpuCommand } from '@pplale/game-core';
import type { Command, GameState } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import type { DrawFlight } from '../BoardPieces';

const CPU_DELAY = 650;

/** Plays side 1 with the engine's CPU, one command at a time, waiting for animations. */
export function useCpuPlayer({ enabled, game, act, busy, flights }: {
  enabled: boolean; game: GameState; act: (command: Command) => void;
  /** Any animation is running. Opening draws and the mulligan may overlap the human's flights. */
  busy: { any: boolean; blocking: boolean }; flights: DrawFlight[];
}) {
  useEffect(() => {
    if (!enabled || busy.blocking || game.winner !== null || game.phase === 'dice') return;
    const cpuCardFlying = flights.some(f => game.players[1].hand.includes(f.uid));
    if (game.phase === 'opening') {
      if (game.openingRemaining[1] <= 0 || cpuCardFlying) return;
    } else if (game.phase === 'mulligan') {
      if (game.mulligan.confirmed[1] || cpuCardFlying) return;
    } else if (busy.any || (game.pending?.task.actor ?? game.active) !== 1) return;
    const timer = setTimeout(() => {
      const command = cpuCommand(game, gameCatalog);
      if (command) act(command);
    }, CPU_DELAY);
    return () => clearTimeout(timer);
  }, [enabled, game, act, busy.any, busy.blocking, flights]);
}
