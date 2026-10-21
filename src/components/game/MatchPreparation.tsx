'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AssetProgress } from '@/lib/game/room/warmAssets';
import styles from './MatchPreparation.module.css';

export function PreparationProgress({ progress, overlay = false }: { progress: AssetProgress | null; overlay?: boolean }) {
  return progress && <div className={`${styles.progress} ${overlay ? styles.overlay : ''}`} role="status">
    <span>対戦を準備中…</span>
    <progress aria-label="対戦データの準備" max={progress.total || 1} value={progress.done} />
  </div>;
}

export function useMatchPreparation() {
  const [progress, setProgress] = useState<AssetProgress | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const prepare = useCallback(async (ids: string[], cpu = false, master = false) => {
    active.current?.abort();
    const controller = active.current = new AbortController();
    setProgress({ done: 0, total: 1 });
    try {
      const { prepareMatchAssets } = await import('@/lib/game/prepareMatch');
      await prepareMatchAssets(ids, { cpu, master, signal: controller.signal, progress: value => { if (!controller.signal.aborted) setProgress(value); } });
    } finally { if (active.current === controller && !controller.signal.aborted) setProgress(null); }
  }, []);
  return { prepare, progress, busy: progress !== null };
}

/** Direct URLs and resumes also prepare before mounting any gameplay hooks. */
export function MatchAssetGate({ ids, cpu = false, master = false, children }: { ids: string[]; cpu?: boolean; master?: boolean; children: ReactNode }) {
  const key = JSON.stringify({ cpu, master, ids });
  const [ready, setReady] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<AssetProgress | null>({ done: 0, total: 1 });
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const options = JSON.parse(key) as { ids: string[]; cpu: boolean; master: boolean };
    void import('@/lib/game/prepareMatch').then(({ prepareMatchAssets }) => prepareMatchAssets(options.ids, { cpu: options.cpu, master: options.master, signal: controller.signal, progress: value => { if (!controller.signal.aborted) setProgress(value); } }))
      .then(() => { if (!controller.signal.aborted) setReady(key); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '対戦を準備できませんでした'); });
    return () => controller.abort();
  }, [key, attempt]);
  if (ready === key) return children;
  return <section className={styles.gate} aria-busy={!error}>
    {error ? <><p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>もう一度準備する</button></> : <PreparationProgress progress={progress} />}
  </section>;
}
