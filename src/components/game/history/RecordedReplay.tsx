'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MatchRecording } from '@pplale/game-core/history';
import { readRecording } from '@/lib/game/room/client';
import { useAuth } from '@/lib/auth';
import { BoardTable } from '../BoardEmulator';
import { useRecordedSession } from './useRecordedSession';
import { GameStage } from '../stage/GameStage';
import styles from './History.module.css';

/** Playback consumes authoritative frames only: no AI, rules execution or match requests. It runs on the ordinary table. */
export function RecordedReplay() {
  const params = useSearchParams(), id = params.get('id');
  const step = Math.max(0, Number(params.get('step')) || 0);
  const { user, loading } = useAuth();
  if (loading) return <main className={styles.replayPage} role="status">認証を確認しています…</main>;
  return <IdentityReplay key={`${id}:${step}:${user?.uid ?? 'guest'}`} id={id} step={step} />;
}

function IdentityReplay({ id, step }: { id: string | null; step: number }) {
  const [recording, setRecording] = useState<MatchRecording | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id || !/^[\da-f-]{36}$/.test(id)) { setError('リプレイが見つかりません'); return; }
    let current = true;
    readRecording(id).then(value => {
      if (current) {
        if (value.format !== 1 || !value.match.complete || !value.frames.length) setError('この対戦の完全なリプレイは保存されていません');
        else setRecording(value);
      }
    }, (failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'リプレイを読み込めませんでした'); });
    return () => { current = false; };
  }, [id]);
  if (!recording) return <main className={styles.replayPage}><section className={styles.history} role="status"><h1>リプレイ</h1><p>{error || 'リプレイを読み込んでいます…'}</p><Link href="/game/battle/history/">対戦履歴へ戻る</Link></section></main>;
  return <Player key={recording.match.id} recording={recording} initialStep={step} />;
}

function Player({ recording, initialStep }: { recording: MatchRecording; initialStep: number }) {
  const router = useRouter();
  const back = recording.match.watching ? '/game/battle/free/' : '/game/battle/history/';
  const onLeave = useCallback(() => router.push(back), [router, back]);
  const session = useRecordedSession({ recording, initialStep, onLeave });
  return <GameStage><BoardTable session={session} /></GameStage>;
}
