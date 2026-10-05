'use client';

// Preparation before entering the board, shown inside the game menu: against the CPU, or watching
// two CPUs. Matches between players (rooms) will get their own preparation on the バトル tab. The
// prepared match is saved in the browser and the board page (/game/play/) picks it up.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GameState } from '@pplale/game-core';
import { PLAY_PATH, describeSavedMatch, saveSession } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';
import { GameSetup } from './GameSetup';
import styles from './GameLobby.module.css';

const modes: Mode[] = ['cpu', 'watch'];

export default function GameLobby() {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  // localStorage is only available in the browser, after the first render.
  useEffect(() => { setSaved(describeSavedMatch()); }, []);

  function start({ game, seed, setup, mode, levels }: { game: GameState; seed: number; setup: MatchSetup; mode: Mode; levels: Levels }) {
    try {
      // The first state and the setup are kept for the replay and the rematch on the result screen.
      saveSession({ game, mode, levels, setup, initial: game, commands: [], seed });
      router.push(PLAY_PATH);
    } catch { setError('このブラウザに対戦を保存できないため、開始できません'); }
  }

  return <>
    {saved && <Link href={PLAY_PATH} className={styles.resume}>
      <span>前回の対戦を続ける</span><small>{saved}</small>
    </Link>}
    <GameSetup modes={modes} onStart={start} />
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </>;
}
