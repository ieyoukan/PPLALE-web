'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { canAttack, other } from '@pplale/game-core';
import type { Command, DeckKind, GameState, Side } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import type { DrawFlight } from '../BoardPieces';
import { TURN_NOTICE_DURATION } from '../TurnAnnouncement';
import type { TurnNotice } from '../TurnAnnouncement';
import type { Mode } from './useGameSession';

export type Strike = { uid: string; cardId: string; x: number; y: number; dx: number; dy: number; width: number; height: number };

const DRAW_DURATION = 800;
const STRIKE_HIT = 360;
const STRIKE_DURATION = 720;
const rectOf = (element: Element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};

/**
 * Visual effects derived from state changes: cards flying from deck to hand, the attack lunge and
 * the turn announcement. Nothing here changes the game; `busy` tells the board to wait.
 */
export function useBoardAnimations({ game, view, mode, container }: { game: GameState; view: Side; mode: Mode; container: RefObject<HTMLDivElement | null> }) {
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null);
  const previous = useRef(game);
  const enabled = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((callback: () => void, delay: number) => { timers.current.push(setTimeout(callback, delay)); }, []);

  // Compare with the previous state: new hand cards that came from a deck fly in.
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = game;
    if (!enabled.current || old === game || !container.current) return;
    const root = container.current;
    const next: DrawFlight[] = [];
    for (const side of [0, 1] as Side[]) {
      for (const uid of game.players[side].hand) {
        if (old.players[side].hand.includes(uid)) continue;
        const kind: DeckKind | null = old.players[side].yojo.includes(uid) ? 'yojo' : old.players[side].sweet.includes(uid) ? 'sweet' : null;
        const source = kind && root.querySelector(`[data-deck="${side}-${kind}"] [data-stack]`);
        const target = root.querySelector(`[data-hand="${uid}"]`);
        if (!source || !target) continue;
        next.push({ uid, cardId: game.cards[uid].cardId, face: side === view || game.cards[uid].revealed, turn: side !== view, from: rectOf(source), to: rectOf(target) });
      }
    }
    if (next.length) {
      setFlights(current => [...current, ...next]);
      later(() => setFlights(current => current.filter(f => !next.some(n => n.uid === f.uid))), DRAW_DURATION);
    }
    const beginsTurn = game.phase === 'playing' && (old.phase !== 'playing' || old.turn !== game.turn);
    if (beginsTurn) {
      const announce = () => {
        setTurnNotice({ id: game.turn, own: mode === 'hotseat' || game.active === view, number: game.players[game.active].turns, pp: game.players[game.active].pp });
        later(() => setTurnNotice(null), TURN_NOTICE_DURATION);
      };
      if (next.length) later(announce, DRAW_DURATION);
      else announce();
    }
  }, [game, view, mode, container, later]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** Runs `commit` (applying the command) with its animation: attacks lunge first. */
  const run = useCallback((command: Command, commit: () => void) => {
    const apply = () => { enabled.current = true; commit(); };
    const root = container.current;
    if (command.type === 'attack' && root && canAttack(game, command.actor, command.uid, command.target, gameCatalog)) {
      const source = root.querySelector(`[data-unit="${command.uid}"]`);
      const target = root.querySelector(command.target === 'leader' ? `[data-leader="${other(command.actor)}"]` : `[data-unit="${command.target}"]`);
      if (source && target) {
        const a = rectOf(source), b = rectOf(target);
        setStrike({ uid: command.uid, cardId: game.cards[command.uid].cardId, ...a, dx: b.x + b.width / 2 - a.x - a.width / 2, dy: b.y + b.height / 2 - a.y - a.height / 2 });
        later(apply, STRIKE_HIT);
        later(() => setStrike(null), STRIKE_DURATION);
        return;
      }
    }
    apply();
  }, [game, container, later]);

  /** Loads, restores and undo jump without animating the difference. */
  const skipNext = useCallback(() => { enabled.current = false; }, []);
  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    enabled.current = false;
    setFlights([]);
    setStrike(null);
    setTurnNotice(null);
  }, []);

  return { flights, strike, turnNotice, busy: flights.length > 0 || !!strike || !!turnNotice, run, skipNext, reset };
}
