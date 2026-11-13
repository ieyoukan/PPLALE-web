'use client';

// 曲が始まったとき、右側に曲名をうっすら白い文字で一度だけ出し、数秒で消す。操作の邪魔をしない（押せない）。
import { useSyncExternalStore } from 'react';
import { gameAudio } from '@/lib/game/gameAudio';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './NowPlaying.module.css';

export function NowPlaying() {
  const started = useSyncExternalStore(gameAudio().subscribe, () => gameAudio().nowPlaying(), () => null);
  if (!started) return null;
  const { track, at } = started;
  // A new key restarts the animation for every track that starts; once it has played out, it stays invisible.
  return <div key={`${track.id}-${at}`} className={styles.nowPlaying} aria-hidden="true" data-now-playing={track.id}>
    <GameIcon name="music" />
    <span className={styles.text}><b>{track.title}</b>{track.version && <small>{track.version}</small>}</span>
  </div>;
}
