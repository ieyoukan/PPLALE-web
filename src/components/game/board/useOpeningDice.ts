'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyCommand } from '@pplale/game-core';
import type { Command, GameState, Side } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import { DICE_THROW_DURATION } from '../OpeningDie';

const REVEAL_DURATION = 1200;
const CPU_DELAY = 650;

/**
 * The first-player dice. The 3D die needs the result before the throw starts, so it is computed
 * with the deterministic engine and then committed when the throw lands.
 */
export function useOpeningDice({ game, act, paused, cpuRolls, cpuSides }: { game: GameState; act: (command: Command) => void; paused: boolean; cpuRolls: boolean; cpuSides: Side[] }) {
  const [rolling, setRolling] = useState(false);
  const [rollingSide, setRollingSide] = useState<Side>(0);
  const [reveal, setReveal] = useState(false);
  const [outcome, setOutcome] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const complete = !!game.dice?.rolls.every(value => value !== null);
  const nextDie: Side = complete || !game.dice || game.dice.rolls[0] === null ? 0 : 1;
  const busy = rolling || reveal;

  const roll = useCallback(() => {
    if (busy || paused || game.phase !== 'dice') return;
    const preview = applyCommand(game, { type: 'roll', actor: nextDie }, gameCatalog);
    if (preview.error) return;
    setOutcome(preview.state.dice!.rolls[nextDie]);
    setRollingSide(nextDie);
    setRolling(true);
    timer.current = setTimeout(() => {
      act({ type: 'roll', actor: nextDie });
      setRolling(false);
      setReveal(true);
      timer.current = setTimeout(() => { setReveal(false); timer.current = null; }, REVEAL_DURATION);
    }, DICE_THROW_DURATION);
  }, [busy, paused, game, nextDie, act]);

  // A CPU side throws its own die.
  useEffect(() => {
    if (!cpuRolls || busy || game.phase !== 'dice' || !cpuSides.includes(nextDie)) return;
    const id = setTimeout(roll, CPU_DELAY);
    return () => clearTimeout(id);
  }, [cpuRolls, cpuSides, busy, game.phase, nextDie, roll]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRolling(false);
    setReveal(false);
  }, []);
  return { rolling, rollingSide, reveal, outcome, complete, nextDie, busy, roll, reset };
}
