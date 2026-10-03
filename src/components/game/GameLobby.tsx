'use client';

// ゲームの準備ページ: choose how to play before entering the board. The prepared match is saved
// in the browser and the board page (/game/play/) picks it up, so other ways to start a match
// (for example playing against another user) can be added here without touching the board.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GameState } from '@pplale/game-core';
import { PLAY_PATH, readSession, saveSession } from '@/lib/game/sessionStore';
import type { Levels, Mode } from '@/lib/game/sessionStore';
import { GameSetup } from './GameSetup';
import styles from './GameLobby.module.css';

/** What the saved match looks like, for the "continue" button. */
function describeSaved(): string | null {
  const saved = readSession();
  const game = saved?.game as Partial<GameState> | undefined;
  if (!game || game.winner !== null || !Array.isArray(game.players)) return null;
  const mode = saved?.mode === 'watch' ? 'CPU同士を観戦' : saved?.mode === 'hotseat' ? '両側を操作' : 'CPUと対戦';
  return game.phase === 'playing' ? `${mode}・${game.turn}ターン目` : `${mode}・開始前`;
}

export default function GameLobby() {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  // localStorage is only available in the browser, after the first render.
  useEffect(() => { setSaved(describeSaved()); }, []);

  function start(game: GameState, mode: Mode, levels: Levels) {
    try {
      saveSession({ game, mode, levels });
      router.push(PLAY_PATH);
    } catch { setError('このブラウザに対戦を保存できないため、開始できません'); }
  }

  return <main className={styles.lobby}>
    <div className={styles.card}>
      <header className={styles.heading}>
        <h1>ゲームの準備</h1>
        <Link href="/" className={styles.home}>ホームへ</Link>
      </header>
      {saved && <Link href={PLAY_PATH} className={styles.resume}>
        <span>前回の対戦を続ける</span><small>{saved}</small>
      </Link>}
      <GameSetup onStart={start} />
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </main>;
}
