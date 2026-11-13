'use client';

// ゲームの画面全体でBGMを流す。最初の操作で音を始め、タブが隠れると止める。対戦の盤面があるあいだは対戦のBGM
// （設定で選んだ曲か、ランダム）。曲が始まると右側に曲名を一度出す（NowPlaying）。
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_VOLUMES, gameAudio } from '@/lib/game/gameAudio';
import type { AudioChannel, MatchMusicChoice } from '@/lib/game/gameAudio';
import { NowPlaying } from './NowPlaying';

/** Boards on screen ask for the match music; the count goes back to 0 when they are gone. */
const MatchMusic = createContext<(on: boolean) => void>(() => {});

export function GameAudioProvider({ children }: { children: ReactNode }) {
  const [boards, setBoards] = useState(0);
  const claim = useCallback((on: boolean) => setBoards(count => Math.max(0, count + (on ? 1 : -1))), []);
  useEffect(() => { gameAudio().setScene(boards > 0 ? 'match' : 'home'); }, [boards]);
  useEffect(() => {
    const unlock = (event: Event) => { if (event.isTrusted) gameAudio().unlock(); };
    const visibility = () => gameAudio().setVisible(!document.hidden);
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', visibility);
      // Leaving the game (to the site): the music stops.
      gameAudio().setVisible(false);
    };
  }, []);
  return <MatchMusic.Provider value={claim}>{children}<NowPlaying /></MatchMusic.Provider>;
}

/** Plays the match music while the calling board is on screen (`shown`: in a room, once the camera has reached it). */
export function useMatchMusic(shown = true) {
  const claim = useContext(MatchMusic);
  useEffect(() => {
    if (!shown) return;
    claim(true);
    return () => claim(false);
  }, [claim, shown]);
}

/** A channel's volume (0–1), kept on this device, and how to change it. */
export function useAudioVolume(channel: AudioChannel) {
  const volume = useSyncExternalStore(gameAudio().subscribe, () => gameAudio().volume(channel), () => DEFAULT_VOLUMES[channel]);
  return [volume, (value: number) => gameAudio().setVolume(channel, value)] as const;
}

/** The match music chosen on this device (`random`, or a track's id), and how to change it. */
export function useMatchMusicChoice() {
  const choice = useSyncExternalStore(gameAudio().subscribe, () => gameAudio().matchMusic(), () => 'random');
  return [choice, (value: MatchMusicChoice) => gameAudio().setMatchMusic(value)] as const;
}
