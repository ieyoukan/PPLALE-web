'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { applyCommand, buildPosition, checkPosition, cpuLevels, editGame, newGame, parsePosition, positionOf, sandboxRules } from '@pplale/game-core';
import type { BoardEdit, Command, CpuLevel, GameState, Position, Side } from '@pplale/game-core';
import { demoDeck, gameCatalog } from '@/lib/game/catalog';
import { createMatch, randomSeed, usableSetup } from '@/lib/game/match';
import { readSession, saveSession, sideLabel } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';

export { cpuSidesOf, sideLabel } from '@/lib/game/sessionStore';
export type { Levels, Mode } from '@/lib/game/sessionStore';
/** `commands`: every command applied since the match began (undone ones removed). */
type Session = { game: GameState; error: string; history: GameState[]; commands: Command[] };
type Action = { type: 'command'; command: Command; sandbox: boolean } | { type: 'load'; game: GameState; commands: Command[] } | { type: 'undo' }
  | { type: 'edit'; edit: BoardEdit } | { type: 'replace'; game: GameState };
/**
 * Where the match came from: its first state (for the replay), its setup (for a rematch) and the
 * shuffle seed (for the report to the CPU server, which rebuilds the match from decks and seed).
 */
type Origin = { initial: GameState | null; setup: MatchSetup | null; seed: number | null; reported: boolean; position: Position | null };

/** One change of a room's match waiting to be shown: the view after it and what caused it. */
export interface Incoming {
  /** Differs for every change. */
  key: string;
  game: GameState;
  /** The command that led here (null for anything else, such as the other side giving up). */
  command: Command | null;
  /** The card that command played or revealed. */
  cardId?: string;
  /** Another match than the one on the table: shown without animating the jump. */
  fresh: boolean;
}
/** What a match played in a room adds: the server applies the commands and sends back what this seat may see. */
export interface RemoteSession {
  /** The seat this browser plays; for a spectator the side shown near. */
  seat: Side;
  /** Looking on without a seat: nothing can be done, and both hands are shown. */
  watching: boolean;
  names: [string, string];
  /** A command is on its way, or a change has not been shown yet: nothing new may be sent. */
  waiting: boolean;
  next: Incoming | null;
  /** Puts `next` on the table. */
  accept: () => void;
  resign: () => void;
  /** The seat that gave up this match. */
  resigned: Side | null;
  leave: () => void;
}

/** The 盤面エディタ's part of a session: the board is changed by hand, then played from there. */
export interface Editor {
  editing: boolean;
  edit: (change: BoardEdit) => void;
  /** Replaces the whole board being edited (cleared, opened from a code or a saved board). */
  replaceBoard: (position: Position) => void;
  /** The board on the table as a position, with its name. Null where boards are not edited (rooms). */
  currentPosition: (() => Position) | null;
  setTitle: (title: string) => void;
  /** Plays the edited board from here; returns why it cannot be played. */
  startPlay: (as: 'hotseat' | 'cpu', level: CpuLevel) => string[];
  /** Edits the position on the table (the match in play becomes the board being edited). */
  startEdit: () => void;
  /** Edits the board the match started from (after the match, the table is no longer a position to play). */
  editStart: () => void;
}
/** For a session whose board is never edited. */
export const withoutEditor: Editor = {
  editing: false, edit: () => {}, replaceBoard: () => {}, currentPosition: null, setTitle: () => {}, startPlay: () => [], startEdit: () => {}, editStart: () => {},
};
const sideNames = (as: Mode): [string, string] => [sideLabel(as, 0), sideLabel(as, 1)];

const HISTORY_LIMIT = 20;
const modes: Mode[] = ['cpu', 'hotseat', 'watch'];

function reducer(session: Session, action: Action): Session {
  if (action.type === 'load') return { game: action.game, error: '', history: [], commands: action.commands };
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous ? { game: previous, error: '', history: session.history.slice(0, -1), commands: session.commands.slice(0, -1) } : session;
  }
  // Edits of the board (edit mode) can be undone like moves; they are not commands of a match.
  if (action.type === 'edit' || action.type === 'replace') {
    let game: GameState;
    try { game = action.type === 'edit' ? editGame(session.game, action.edit, gameCatalog) : action.game; } catch (error) {
      return { ...session, error: error instanceof Error ? error.message : '編集できません' };
    }
    return { game, error: '', history: [...session.history.slice(1 - HISTORY_LIMIT), session.game], commands: [] };
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
  const [origin, setOrigin] = useState<Origin>({ initial: null, setup: null, seed: null, reported: false, position: null });
  /** While replaying: the finished match to return to. */
  const [replay, setReplay] = useState<{ game: GameState; commands: Command[] } | null>(null);
  const [ready, setReady] = useState(false);
  /** 盤面エディタ: the board is changed by hand instead of played. */
  const [editing, setEditing] = useState(false);
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
      setOrigin({ initial: replayable ? initial : null, setup: usableSetup(saved.setup), seed: replayable && typeof saved.seed === 'number' ? saved.seed : null, reported: saved.reported === true, position: parsePosition(saved.position) });
      setMode(modes.includes(saved.mode as Mode) ? saved.mode as Mode : 'cpu');
      setEditing(saved.editing === true && state.phase === 'playing');
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
        ...(origin.position && { position: origin.position }),
        ...(editing && { editing: true }),
      });
    } catch { setSaveError('このブラウザに対戦を保存できません'); }
  }, [ready, replay, session.game, session.commands, mode, levels, origin, editing]);

  // Same-device play allows the sandbox test commands; a replay may contain them.
  const send = useCallback((command: Command) => dispatch({ type: 'command', command, sandbox: mode === 'hotseat' || !!replay }), [mode, replay]);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const edit = useCallback((change: BoardEdit) => dispatch({ type: 'edit', edit: change }), []);

  const { initial, setup, seed, reported, position } = origin;
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
  /** The same decks, rules, mode and levels with a new shuffle; a match from the editor starts from its board again. */
  const rematch = useCallback(() => {
    if (position) {
      const game = buildPosition(position, gameCatalog, { names: [sideLabel(mode, 0), sideLabel(mode, 1)] });
      setReplay(null);
      setOrigin(previous => ({ ...previous, initial: game, reported: false }));
      dispatch({ type: 'load', game, commands: [] });
      return;
    }
    if (!setup) return;
    const seed = randomSeed(), game = createMatch(setup, mode, seed);
    setReplay(null);
    setOrigin({ initial: game, setup, seed, reported: false, position: null });
    dispatch({ type: 'load', game, commands: [] });
  }, [setup, mode, position]);

  const editor: Editor = {
    editing,
    edit,
    replaceBoard: useCallback((position: Position) => {
      setOrigin(previous => ({ ...previous, position }));
      dispatch({ type: 'replace', game: buildPosition(position, gameCatalog, { names: sideNames('hotseat') }) });
    }, []),
    currentPosition: useCallback((): Position => {
      const title = position?.title;
      return { ...positionOf(session.game, gameCatalog), ...(title && { title }) };
    }, [position, session.game]),
    setTitle: useCallback((title: string) => setOrigin(previous => ({ ...previous, position: { ...(previous.position ?? positionOf(session.game, gameCatalog)), title: title || undefined } })), [session.game]),
    startPlay: useCallback((as: 'hotseat' | 'cpu', level: CpuLevel): string[] => {
      const board = { ...positionOf(session.game, gameCatalog), ...(position?.title && { title: position.title }) };
      const errors = checkPosition(board, gameCatalog);
      if (errors.length) return errors;
      const game = buildPosition(board, gameCatalog, { names: sideNames(as) });
      setReplay(null);
      setMode(as);
      setLevels(['master', level]);
      setEditing(false);
      setOrigin({ initial: game, setup: null, seed: null, reported: false, position: board });
      dispatch({ type: 'load', game, commands: [] });
      return [];
    }, [session.game, position]),
    startEdit: useCallback(() => {
      const board = { ...positionOf(session.game, gameCatalog), ...(position?.title && { title: position.title }) };
      setReplay(null);
      setMode('hotseat');
      setEditing(true);
      setOrigin({ initial: null, setup: null, seed: null, reported: false, position: board });
      dispatch({ type: 'load', game: buildPosition(board, gameCatalog, { names: sideNames('hotseat') }), commands: [] });
    }, [session.game, position]),
    editStart: useCallback(() => {
      if (!position) return;
      setReplay(null);
      setMode('hotseat');
      setEditing(true);
      setOrigin({ initial: null, setup: null, seed: null, reported: false, position });
      dispatch({ type: 'load', game: buildPosition(position, gameCatalog, { names: sideNames('hotseat') }), commands: [] });
    }, [position]),
  };

  return {
    ...session, ...editor, mode, levels, ready, saveError, send, undo, canUndo: session.history.length > 0 && !replay,
    remote: null as RemoteSession | null,
    /** The match's first state: with `commands` it rebuilds every position (the course of the match, the replay). */
    initial: initial as GameState | null,
    setup, rematch, canRematch: !!setup || !!position,
    /** The editor's board this match started from. */
    position,
    /** What the CPU server needs to rebuild this match, when all of it is known. */
    record: initial && setup && seed !== null && !replay ? { seed, decks: setup.decks, commands: session.commands, reported } : null,
    markReported: useCallback(() => setOrigin(previous => ({ ...previous, reported: true })), []),
    replaying: !!replay, startReplay, stopReplay,
    canReplay: !!initial && !replay && session.game.winner !== null && session.commands.length > 0,
    /** While replaying: the recorded command to apply next, or null at the end. */
    replayNext: replay && initial ? replay.commands[session.game.revision - initial.revision] ?? null : null,
  };
}
/** What the board plays on: the match in this browser, or one in a room (`remote`). */
export type BoardSession = ReturnType<typeof useGameSession>;
