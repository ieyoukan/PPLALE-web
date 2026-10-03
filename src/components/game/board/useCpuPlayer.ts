'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cpuCommand } from '@pplale/game-core';
import type { Command, CpuLevel, GameState } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import type { DrawFlight } from '../BoardPieces';
import type { CpuRequest, CpuResponse } from './cpu.worker';

const CPU_DELAY = 650;
const CPU_SIDE = 1;

type Reply = (command: Command | null) => void;
const thinkHere = (request: CpuRequest, reply: Reply) => reply(cpuCommand(request.game, gameCatalog, { level: request.level, side: request.side }));

/**
 * The CPU thinks in a Web Worker. Without one (old browsers) or if it crashes, it thinks on the
 * main thread instead, including for requests that were still waiting.
 */
function useCpuWorker() {
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(new Map<number, { request: CpuRequest; reply: Reply }>());
  useEffect(() => {
    const pending = waiting.current;
    try {
      const instance = new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' });
      instance.addEventListener('message', (event: MessageEvent<CpuResponse>) => {
        pending.get(event.data.id)?.reply(event.data.command);
        pending.delete(event.data.id);
      });
      instance.addEventListener('error', () => {
        worker.current = null;
        for (const { request, reply } of Array.from(pending.values())) thinkHere(request, reply);
        pending.clear();
      });
      worker.current = instance;
      return () => { instance.terminate(); worker.current = null; pending.clear(); };
    } catch { worker.current = null; }
  }, []);
  return useCallback((request: CpuRequest, reply: Reply) => {
    if (!worker.current) return thinkHere(request, reply);
    waiting.current.set(request.id, { request, reply });
    worker.current.postMessage(request);
  }, []);
}

/** Plays side 1 with the engine's CPU at `level`, one command at a time, waiting for animations. */
export function useCpuPlayer({ enabled, level, game, act, busy, flights }: {
  enabled: boolean; level: CpuLevel; game: GameState; act: (command: Command) => void;
  /** Any animation is running. Opening draws and the mulligan may overlap the human's flights. */
  busy: { any: boolean; blocking: boolean }; flights: DrawFlight[];
}) {
  const think = useCpuWorker();
  const request = useRef(0);
  useEffect(() => {
    if (!enabled || busy.blocking || game.winner !== null || game.phase === 'dice') return;
    const cpuCardFlying = flights.some(f => game.players[CPU_SIDE].hand.includes(f.uid));
    if (game.phase === 'opening') {
      if (game.openingRemaining[CPU_SIDE] <= 0 || cpuCardFlying) return;
    } else if (game.phase === 'mulligan') {
      if (game.mulligan.confirmed[CPU_SIDE] || cpuCardFlying) return;
    } else if (busy.any || (game.pending?.task.actor ?? game.active) !== CPU_SIDE) return;
    // An answer for an older position (the match changed while thinking) is dropped.
    let cancelled = false;
    const timer = setTimeout(() => think({ id: ++request.current, game, level, side: CPU_SIDE }, command => {
      if (command && !cancelled) act(command);
    }), CPU_DELAY);
    return () => { clearTimeout(timer); cancelled = true; };
  }, [enabled, level, game, act, busy.any, busy.blocking, flights, think]);
}
