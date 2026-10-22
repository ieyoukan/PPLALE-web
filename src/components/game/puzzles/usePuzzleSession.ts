'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import type { Command } from '@pplale/game-core';
import { markPuzzleCleared, playPuzzle, puzzleStatus, startPuzzle, undoPuzzle } from '@/lib/game/puzzles';
import type { LethalPuzzle, PuzzleAttempt } from '@/lib/game/puzzles';
import type { BoardSession } from '../board/useGameSession';
import { withoutEditor } from '../board/useGameSession';

const nothing = () => {};
type Action = { type: 'command'; command: Command } | { type: 'reset'; puzzle: LethalPuzzle } | { type: 'undo' };
function reducer(attempt: PuzzleAttempt, action: Action): PuzzleAttempt {
  if (action.type === 'reset') return startPuzzle(action.puzzle);
  return action.type === 'undo' ? undoPuzzle(attempt) : playPuzzle(attempt, action.command);
}

/** A puzzle has its own attempt; it never writes to the saved CPU/editor match. */
export function usePuzzleSession(problem: LethalPuzzle): BoardSession {
  const [attempt, dispatch] = useReducer(reducer, problem, startPuzzle);
  const [saveError, setSaveError] = useState('');
  const status = puzzleStatus(attempt);
  useEffect(() => {
    if (status === 'cleared' && !markPuzzleCleared(problem.id)) setSaveError('クリア記録を保存できませんでした');
  }, [problem.id, status]);
  const send = useCallback((command: Command) => dispatch({ type: 'command', command }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const rematch = useCallback(() => { setSaveError(''); dispatch({ type: 'reset', puzzle: problem }); }, [problem]);
  return {
    ...withoutEditor,
    game: attempt.game, initial: attempt.initial, commands: attempt.commands, history: attempt.history.map(step => step.game),
    error: attempt.error, saveError, ready: true, mode: 'puzzle', levels: ['hard', 'hard'],
    send, undo, canUndo: attempt.history.length > 0, remote: null,
    setup: null, position: null, rematch, canRematch: true,
    record: null, markReported: nothing,
    replaying: false, startReplay: nothing, stopReplay: nothing, canReplay: false, replayNext: null, timeline: null,
    puzzle: { problem, status },
  };
}
