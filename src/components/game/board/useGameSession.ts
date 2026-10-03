'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { applyCommand, cpuLevels, newGame, sandboxRules } from '@pplale/game-core';
import type { Command, CpuLevel, GameState, Side } from '@pplale/game-core';
import { demoDeck, gameCatalog } from '@/lib/game/catalog';
import { readSession, saveSession } from '@/lib/game/sessionStore';
import type { Levels, Mode } from '@/lib/game/sessionStore';

export type { Levels, Mode } from '@/lib/game/sessionStore';
type Session = { game: GameState; error: string; history: GameState[] };
type Action = { type: 'command'; command: Command; sandbox: boolean } | { type: 'load'; game: GameState } | { type: 'undo' };

const HISTORY_LIMIT = 20;
const modes: Mode[] = ['cpu', 'hotseat', 'watch'];
/** Sides the CPU plays in a mode. */
export const cpuSidesOf = (mode: Mode): Side[] => mode === 'cpu' ? [1] : mode === 'watch' ? [0, 1] : [];
/** Display name of a side from the viewer's seat (side 0 is the near side). */
export const sideLabel = (mode: Mode, side: Side) => mode === 'watch' ? `CPU ${side + 1}` : side === 0 ? 'あなた' : mode === 'cpu' ? 'CPU' : '相手';

function reducer(session: Session, action: Action): Session {
  if (action.type === 'load') return { game: action.game, error: '', history: [] };
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous ? { game: previous, error: '', history: session.history.slice(0, -1) } : session;
  }
  const result = applyCommand(session.game, action.command, gameCatalog, action.sandbox);
  return result.error ? { ...session, error: result.error } : { game: result.state, error: '', history: [...session.history.slice(1 - HISTORY_LIMIT), session.game] };
}

// Only a placeholder until the saved match is loaded; the board is not shown before `ready`.
const placeholder = (): Session => ({ game: newGame([{ ...demoDeck, name: 'あなた' }, { ...demoDeck, name: 'CPU' }], gameCatalog, sandboxRules, 42), error: '', history: [] });

/**
 * The match prepared on the preparation page, its undo history and browser persistence. All game
 * changes go through `send`. Without a usable saved match `onMissing` is called (back to preparation).
 */
export function useGameSession({ onMissing }: { onMissing: () => void }) {
  const [session, dispatch] = useReducer(reducer, undefined, placeholder);
  const [mode, setMode] = useState<Mode>('cpu');
  const [levels, setLevels] = useState<Levels>(['normal', 'normal']);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const saved = readSession();
      const { restoreGame } = await import('@pplale/game-core/snapshot');
      if (cancelled) return;
      const state = saved ? restoreGame(saved.game, gameCatalog) : null;
      if (!saved || !state) return onMissing();
      dispatch({ type: 'load', game: state });
      setMode(modes.includes(saved.mode as Mode) ? saved.mode as Mode : 'cpu');
      // Saves from before the watch mode only stored the opponent's level.
      const valid = (value: unknown): value is CpuLevel => cpuLevels.includes(value as CpuLevel);
      if (Array.isArray(saved.levels) && saved.levels.length === 2 && saved.levels.every(valid)) setLevels(saved.levels as Levels);
      else if (valid(saved.level)) setLevels(['normal', saved.level]);
      setReady(true);
    }
    void restore();
    return () => { cancelled = true; };
    // Restore once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { saveSession({ game: session.game, mode, levels }); }
    catch { setSaveError('このブラウザに対戦を保存できません'); }
  }, [ready, session.game, mode, levels]);

  // Same-device play allows the sandbox test commands.
  const send = useCallback((command: Command) => dispatch({ type: 'command', command, sandbox: mode === 'hotseat' }), [mode]);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  return { ...session, mode, levels, ready, saveError, send, undo, canUndo: session.history.length > 0 };
}
