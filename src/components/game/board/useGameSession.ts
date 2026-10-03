'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { applyCommand, newGame, sandboxRules } from '@pplale/game-core';
import type { Command, CpuLevel, GameState } from '@pplale/game-core';
import { cpuLevels } from '@pplale/game-core';
import { demoDeck, gameCatalog } from '@/lib/game/catalog';

export type Mode = 'cpu' | 'hotseat';
type Session = { game: GameState; error: string; history: GameState[] };
type Action = { type: 'command'; command: Command; sandbox: boolean } | { type: 'load'; game: GameState } | { type: 'undo' };

const STORAGE_KEY = 'pplale-game-session-v2';
const HISTORY_LIMIT = 20;

function reducer(session: Session, action: Action): Session {
  if (action.type === 'load') return { game: action.game, error: '', history: [] };
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous ? { game: previous, error: '', history: session.history.slice(0, -1) } : session;
  }
  const result = applyCommand(session.game, action.command, gameCatalog, action.sandbox);
  return result.error ? { ...session, error: result.error } : { game: result.state, error: '', history: [...session.history.slice(1 - HISTORY_LIMIT), session.game] };
}

const initial = (): Session => ({ game: newGame([{ ...demoDeck, name: 'あなた' }, { ...demoDeck, name: 'CPU' }], gameCatalog, sandboxRules, 42), error: '', history: [] });

/** The match state, undo history and browser persistence. All game changes go through `send`. */
export function useGameSession({ onRestored }: { onRestored: () => void }) {
  const [session, dispatch] = useReducer(reducer, undefined, initial);
  const [mode, setMode] = useState<Mode>('cpu');
  const [level, setLevel] = useState<CpuLevel>('normal');
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const { restoreGame } = await import('@pplale/game-core/snapshot');
          if (cancelled) return;
          const saved = JSON.parse(raw);
          const state = restoreGame(saved.game, gameCatalog);
          if (state) {
            dispatch({ type: 'load', game: state });
            setMode(saved.mode === 'hotseat' ? 'hotseat' : 'cpu');
            if (cpuLevels.includes(saved.level)) setLevel(saved.level);
            onRestored();
          } else setSaveError('前回の対戦を復元できませんでした');
        }
      } catch { if (!cancelled) setSaveError('前回の対戦を復元できませんでした'); }
      if (!cancelled) setReady(true);
    }
    void restore();
    return () => { cancelled = true; };
    // Restore once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ game: session.game, mode, level })); }
    catch { setSaveError('このブラウザに対戦を保存できません'); }
  }, [ready, session.game, mode, level]);

  // Same-device play allows the sandbox test commands.
  const send = useCallback((command: Command) => dispatch({ type: 'command', command, sandbox: mode === 'hotseat' }), [mode]);
  const load = useCallback((game: GameState, nextMode: Mode, nextLevel: CpuLevel) => { dispatch({ type: 'load', game }); setMode(nextMode); setLevel(nextLevel); setSaveError(''); }, []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  return { ...session, mode, setMode, level, ready, saveError, send, load, undo, canUndo: session.history.length > 0 };
}
