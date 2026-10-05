'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, GameState, Side } from '@pplale/game-core';
import { cpuServerUrl, servedModel } from '@/lib/game/cpuServer';
import type { ServedModel } from '@/lib/game/cpuServer';
import type { DrawFlight } from '../BoardPieces';
import type { CpuRequest, CpuResponse } from './cpu.worker';
import type { Levels } from './useGameSession';

const CPU_DELAY = 650;

type Reply = (response: CpuResponse) => void;
const thinkHere = (request: CpuRequest, reply: Reply) => {
  void import('./cpuThink').then(({ think }) => reply(think(request)));
};

/**
 * The CPU thinks in a Web Worker. Without one (old browsers) or if it crashes, it thinks on the
 * main thread instead, including for requests that were still waiting.
 */
function useCpuWorker(enabled: boolean) {
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(new Map<number, { request: CpuRequest; reply: Reply }>());
  useEffect(() => {
    if (!enabled) return;
    const pending = waiting.current;
    try {
      const instance = new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' });
      instance.addEventListener('message', (event: MessageEvent<CpuResponse>) => {
        pending.get(event.data.id)?.reply(event.data);
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
  }, [enabled]);
  return useCallback((request: CpuRequest, reply: Reply) => {
    if (!worker.current) return thinkHere(request, reply);
    waiting.current.set(request.id, { request, reply });
    worker.current.postMessage(request);
  }, []);
}

/** The CPU side that should act now, or null. Opening draws and the mulligan run in parallel per side. */
function cpuToMove(game: GameState, sides: Side[], flights: DrawFlight[], animating: boolean): Side | null {
  const cardFlying = (side: Side) => flights.some(f => game.players[side].hand.includes(f.uid));
  if (game.phase === 'opening') return sides.find(side => game.openingRemaining[side] > 0 && !cardFlying(side)) ?? null;
  if (game.phase === 'mulligan') return sides.find(side => !game.mulligan.confirmed[side] && !cardFlying(side)) ?? null;
  const actor = game.pending?.task.actor ?? game.active;
  return !animating && sides.includes(actor) ? actor : null;
}

/**
 * Plays every side in `sides` with the engine's CPU (one side against a human, both when watching),
 * one command at a time, waiting for animations. Returns the version of the model さいきょう last
 * decided with (for the match report).
 */
export function useCpuPlayer({ enabled, sides, levels, game, act, busy, flights }: {
  enabled: boolean; sides: Side[]; levels: Levels; game: GameState; act: (command: Command) => void;
  /** Any animation is running. Opening draws and the mulligan may overlap the human's flights. */
  busy: { any: boolean; blocking: boolean }; flights: DrawFlight[];
}) {
  const think = useCpuWorker(enabled);
  const request = useRef(0);
  // さいきょう plays with the CPU server's model when there is one; `undefined` while asking for it.
  const wantsServed = enabled && !!cpuServerUrl && sides.some(side => levels[side] === 'master');
  const [served, setServed] = useState<ServedModel | null>();
  useEffect(() => {
    if (!wantsServed) return;
    let current = true;
    void servedModel().then(model => { if (current) setServed(model); });
    return () => { current = false; };
  }, [wantsServed]);
  const modelUsed = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || busy.blocking || game.winner !== null || game.phase === 'dice') return;
    if (wantsServed && served === undefined) return;
    const side = cpuToMove(game, sides, flights, busy.any);
    if (side === null) return;
    // An answer for an older position (the match changed while thinking) is dropped.
    let cancelled = false;
    const timer = setTimeout(() => think({ id: ++request.current, game, level: levels[side], side, served }, response => {
      if (response.model) modelUsed.current = response.model;
      if (response.command && !cancelled) act(response.command);
    }), CPU_DELAY);
    return () => { clearTimeout(timer); cancelled = true; };
  }, [enabled, sides, levels, game, act, busy.any, busy.blocking, flights, think, wantsServed, served]);
  return modelUsed;
}
