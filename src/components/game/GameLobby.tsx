'use client';

// Preparation before entering the board, reached from the game's home: `solo` (against the CPU,
// or watching two CPUs) and `battle` (between people: the same device now, rooms later). The
// prepared match is saved in the browser and the board page (/game/play/) picks it up.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GameState } from '@pplale/game-core';
import { HOME_PATH, PLAY_PATH, describeSavedMatch, saveSession } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';
import { GameSetup } from './GameSetup';
import styles from './GameLobby.module.css';

const kinds = {
  solo: { title: 'CPU対決', modes: ['cpu', 'watch'] },
  battle: { title: 'バトル', modes: ['hotseat'] },
} satisfies Record<string, { title: string; modes: Mode[] }>;

export default function GameLobby({ kind }: { kind: keyof typeof kinds }) {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  // localStorage is only available in the browser, after the first render.
  useEffect(() => { setSaved(describeSavedMatch()); }, []);

  function start({ game, setup, mode, levels }: { game: GameState; setup: MatchSetup; mode: Mode; levels: Levels }) {
    try {
      // The first state and the setup are kept for the replay and the rematch on the result screen.
      saveSession({ game, mode, levels, setup, initial: game, commands: [] });
      router.push(PLAY_PATH);
    } catch { setError('このブラウザに対戦を保存できないため、開始できません'); }
  }

  return <main className={styles.lobby}>
    <div className={styles.card}>
      <header className={styles.heading}>
        <h1>{kinds[kind].title}</h1>
        <Link href={HOME_PATH} className={styles.home}>ホームへ</Link>
      </header>
      {saved && <Link href={PLAY_PATH} className={styles.resume}>
        <span>前回の対戦を続ける</span><small>{saved}</small>
      </Link>}
      <GameSetup modes={kinds[kind].modes} onStart={start} />
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </main>;
}
