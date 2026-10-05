'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { applyCommand, cpuLevels, newGame, sandboxRules } from '@pplale/game-core';
import type { Command, CpuLevel, GameState } from '@pplale/game-core';
import { demoDeck, gameCatalog } from '@/lib/game/catalog';
import { createMatch, randomSeed, usableSetup } from '@/lib/game/match';
import { readSession, saveSession } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';

export { cpuSidesOf, sideLabel } from '@/lib/game/sessionStore';
export type { Levels, Mode } from '@/lib/game/sessionStore';
/** `commands`: every command applied since the match began (undone ones removed). */
type Session = { game: GameState; error: string; history: GameState[]; commands: Command[] };
type Action = { type: 'command'; command: Command; sandbox: boolean } | { type: 'load'; game: GameState; commands: Command[] } | { type: 'undo' };
/**
 * Where the match came from: its first state (for the replay), its setup (for a rematch) and the
 * shuffle seed (for the report to the CPU server, which rebuilds the match from decks and seed).
 */
type Origin = { initial: GameState | null; setup: MatchSetup | null; seed: number | null; reported: boolean };

const HISTORY_LIMIT = 20;
const modes: Mode[] = ['cpu', 'hotseat', 'watch'];

function reducer(session: Session, action: Action): Session {
  if (action.type === 'load') return { game: action.game, error: '', history: [], commands: action.commands };
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous ? { game: previous, error: '', history: session.history.slice(0, -1), commands: session.commands.slice(0, -1) } : session;
  }
  const result = applyCommand(session.game, action.command, gameCatalog, action.sandbox);
  if (result.error) return { ...session, error: result.error };
  return { game: result.state, error: '', history: [...session.history.slice(1 - HISTORY_LIMIT), session.game], commands: [...session.commands, action.command] };
}

// Only a placeholder until the saved match is loaded; the board is not shown before `ready`.
const placeholder = (): Session => ({ game: newGame([{ ...demoDeck, name: 'あなた' }, { ...demoDeck, name: 'CPU' }], gameCatalog, sandboxRules, 42), error: '', history: [], commands: [] });

/**
 * The match prepared on the preparation page, its undo history and browser persistence. All game
 * changes go through `send`. Without a usable saved match `onMissing` is called (back to preparation).
 * A finished match can be replayed from its command log, or started again from its setup.
 */
export function useGameSession({ onMissing }: { onMissing: () => void }) {
  const [session, dispatch] = useReducer(reducer, undefined, placeholder);
  const [mode, setMode] = useState<Mode>('cpu');
  const [levels, setLevels] = useState<Levels>(['normal', 'normal']);
  const [origin, setOrigin] = useState<Origin>({ initial: null, setup: null, seed: null, reported: false });
  /** While replaying: the finished match to return to. */
  const [replay, setReplay] = useState<{ game: GameState; commands: Command[] } | null>(null);
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
      // The log is only usable when it leads exactly from the first state to the saved one.
      const commands = Array.isArray(saved.commands) ? saved.commands as Command[] : [];
      const initial = saved.initial ? restoreGame(saved.initial, gameCatalog) : null;
      const replayable = !!initial && state.revision - initial.revision === commands.length;
      dispatch({ type: 'load', game: state, commands: replayable ? commands : [] });
      setOrigin({ initial: replayable ? initial : null, setup: usableSetup(saved.setup), seed: replayable && typeof saved.seed === 'number' ? saved.seed : null, reported: saved.reported === true });
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
  // A replay only shows the match again; what is saved stays the finished match.
  useEffect(() => {
    if (!ready || replay) return;
    try {
      saveSession({
        game: session.game, mode, levels,
        ...(origin.setup && { setup: origin.setup }),
        ...(origin.initial && { initial: origin.initial, commands: session.commands }),
        ...(origin.seed !== null && { seed: origin.seed }),
        ...(origin.reported && { reported: true }),
      });
    } catch { setSaveError('このブラウザに対戦を保存できません'); }
  }, [ready, replay, session.game, session.commands, mode, levels, origin]);

  // Same-device play allows the sandbox test commands; a replay may contain them.
  const send = useCallback((command: Command) => dispatch({ type: 'command', command, sandbox: mode === 'hotseat' || !!replay }), [mode, replay]);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);

  const { initial, setup, seed, reported } = origin;
  const startReplay = useCallback(() => {
    if (!initial || replay) return;
    setReplay({ game: session.game, commands: session.commands });
    dispatch({ type: 'load', game: initial, commands: [] });
  }, [initial, replay, session.game, session.commands]);
  const stopReplay = useCallback(() => {
    if (!replay) return;
    dispatch({ type: 'load', game: replay.game, commands: replay.commands });
    setReplay(null);
  }, [replay]);
  /** The same decks, rules, mode and levels with a new shuffle. */
  const rematch = useCallback(() => {
    if (!setup) return;
    const seed = randomSeed(), game = createMatch(setup, mode, seed);
    setReplay(null);
    setOrigin({ initial: game, setup, seed, reported: false });
    dispatch({ type: 'load', game, commands: [] });
  }, [setup, mode]);

  return {
    ...session, mode, levels, ready, saveError, send, undo, canUndo: session.history.length > 0 && !replay,
    setup, rematch, canRematch: !!setup,
    /** What the CPU server needs to rebuild this match, when all of it is known. */
    record: initial && setup && seed !== null && !replay ? { seed, decks: setup.decks, commands: session.commands, reported } : null,
    markReported: useCallback(() => setOrigin(previous => ({ ...previous, reported: true })), []),
    replaying: !!replay, startReplay, stopReplay,
    canReplay: !!initial && !replay && session.game.winner !== null && session.commands.length > 0,
    /** While replaying: the recorded command to apply next, or null at the end. */
    replayNext: replay && initial ? replay.commands[session.game.revision - initial.revision] ?? null : null,
  };
}
