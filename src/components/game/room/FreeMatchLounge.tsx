'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { FreeMatchActivity } from '@pplale/game-core/room';
import { readFreeMatchActivity, roomServerUrl } from '@/lib/game/room/client';
import { watchHref } from '@/lib/game/sessionStore';
import { RecordedCard } from '../history/RecordedCard';
import styles from './Room.module.css';

export function FreeMatchLounge() {
  const [activity, setActivity] = useState<FreeMatchActivity | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!roomServerUrl) return;
    let current = true;
    const refresh = async () => {
      if (document.hidden) return;
      try { const next = await readFreeMatchActivity(); if (current) { setActivity(next); setError(''); } }
      catch { if (current) setError('対戦中のプレイヤーを読み込めませんでした'); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <section className={`${styles.panel} ${styles.lounge}`} aria-label="いま遊んでいるプレイヤー">
    <header><h2>いま遊んでいるプレイヤー</h2><span className={styles.liveDot}>LIVE</span></header>
    {error && <p className={styles.note} role="status">{error}</p>}
    {!activity ? <p className={styles.note}>読み込み中…</p> : <>
      {activity.waiting.length > 0 && <div className={styles.waitingPlayers}><small>対戦相手を募集中</small>{activity.waiting.map((player, index) => <div key={index}><span className={styles.playerIcon}><RecordedCard id={player.playable} sizes="40px" /></span><b>{player.name}</b><span className={styles.searchPulse} aria-label="対戦相手を検索中">•••</span></div>)}</div>}
      {!activity.matches.length && <p className={styles.note}>いま対戦中のフリーマッチはありません。</p>}
      <div className={styles.liveMatches}>{activity.matches.map(match => <article key={match.id}>
        <div className={styles.livePlayers}>{match.players.map((player, index) => <div key={index}>
          <span className={styles.playerIcon}><RecordedCard id={player.playable} sizes="52px" /></span>
          {player.profileId ? <Link href={`/game/profile/?id=${encodeURIComponent(player.profileId)}`}>{player.name}</Link> : <b>{player.name}</b>}
        </div>)}</div>
        <div className={styles.liveMatchStatus}><span>{match.status === 'playing' ? `${match.turn}ターン` : '対戦終了'}</span><small>観戦 {match.watching}人</small></div>
        <Link className={styles.secondary} href={match.status === 'finished' && match.replayId ? `/game/replay/?id=${match.replayId}` : watchHref(match.id)}>{match.status === 'playing' ? '観戦する ›' : 'リプレイ ▶'}</Link>
      </article>)}</div>
    </>}
  </section>;
}
