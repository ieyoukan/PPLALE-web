'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { turnOf } from '@pplale/game-core';
import type { Command } from '@pplale/game-core';
import type { MatchRecording } from '@pplale/game-core/history';
import type { BoardSession, Incoming, ReplayTimeline } from '../board/useGameSession';
import { withoutEditor } from '../board/useGameSession';

// Same pace as the replay of a match in this browser: quick through the opening, time to follow each turn.
const FRAME_DELAY = 500;
const OPENING_DELAY = 150;
const nothing = () => {};

/**
 * A recorded room match played back on the ordinary table, like a spectator receiving it from the
 * server: each recorded state arrives with the command that led to it, and the board animates it.
 * No rules run here. Once played through, the result screen offers to play it again.
 */
export function useRecordedSession({ recording, initialStep, onLeave }: { recording: MatchRecording; initialStep: number; onLeave: () => void }): BoardSession {
  const { frames, match } = recording;
  const [index, setIndex] = useState(() => Math.max(0, Math.min(frames.length - 1, Math.floor(initialStep))));
  const [playing, setPlaying] = useState(() => initialStep < frames.length - 1);
  /** The frame whose successor may be shown: the pause after the previous change has passed. */
  const [due, setDue] = useState<number | null>(null);
  /** Increments when played again from the start, so the board treats it as another match. */
  const [round, setRound] = useState(0);
  const frame = frames[index], following = playing ? frames[index + 1] : undefined;
  useEffect(() => {
    if (!following) return;
    const timer = setTimeout(() => setDue(index), frame.state.phase === 'playing' ? FRAME_DELAY : OPENING_DELAY);
    return () => clearTimeout(timer);
  }, [following, index, frame.state.phase]);
  // The last frame reached: back to the result, like the end of an ordinary replay.
  useEffect(() => { if (playing && !following) setPlaying(false); }, [playing, following]);

  const next = useMemo<Incoming | null>(() => {
    if (!following || due !== index) return null;
    const command = following.command as Command | null, after = following.state;
    return { key: `${round}:${following.sequence}`, game: after, command, cardId: command && 'uid' in command && command.uid ? after.cards[command.uid]?.cardId : undefined, fresh: false };
  }, [following, due, index, round]);
  const accept = useCallback(() => setIndex(previous => Math.min(frames.length - 1, previous + 1)), [frames.length]);
  const restart = useCallback(() => {
    setRound(previous => previous + 1);
    setDue(null);
    setIndex(0);
    setPlaying(true);
  }, []);
  const stop = useCallback(() => {
    setPlaying(false);
    setIndex(frames.length - 1);
  }, [frames.length]);

  // Seeking shows that frame at once; the board cancels what it was presenting (useBoard `seekReplay`).
  const states = useMemo(() => frames.map(frame => frame.state), [frames]);
  const seek = useCallback((at: number) => {
    setDue(null);
    setIndex(Math.max(0, Math.min(frames.length - 1, Math.floor(at))));
  }, [frames.length]);
  const recorded = useMemo(() => frames.flatMap((frame, at) => frame.state.phase === 'playing' && frame.presentation.assessment ? [{ index: at, win: frame.presentation.assessment.win, turn: turnOf(frame.state) }] : []), [frames]);
  const assessment = useMemo(() => playing ? recorded.filter(point => point.index <= index) : recorded, [playing, recorded, index]);
  const timeline = useMemo<ReplayTimeline | null>(() => playing ? { at: index, states, viewer: match.seat, seek, recorded } : null, [playing, index, states, match.seat, seek, recorded]);
  const names = useMemo<[string, string]>(() => [match.players[0].name, match.players[1].name], [match.players]);
  const remote = useMemo(() => ({
    seat: match.seat, watching: true, recorded: true, matchRules: match.rules, names, assessment,
    waiting: playing, sending: false, next, accept, resign: nothing, resigned: null, leave: onLeave,
  }), [match.seat, match.rules, names, assessment, playing, next, accept, onLeave]);
  return {
    game: frame.state, error: '', history: [], commands: [], mode: 'room', levels: ['normal', 'normal'], ready: true, saveError: '',
    send: nothing, undo: nothing, canUndo: false, remote,
    setup: null, rematch: nothing, canRematch: false,
    record: null, markReported: nothing, initial: null, position: null, ...withoutEditor,
    replaying: playing, startReplay: restart, stopReplay: stop,
    canReplay: !playing && frames.length > 1, replayNext: null, timeline,
  };
}
