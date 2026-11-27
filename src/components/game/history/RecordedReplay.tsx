'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MatchRecording } from '@pplale/game-core/history';
import { readRecording, readRoomRecording } from '@/lib/game/room/client';
import { isRoomId } from '@pplale/game-core/room';
import { plazaKey } from '@/lib/game/room/roomSession';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/LocaleProvider';
import { BoardTable } from '../BoardEmulator';
import { useRecordedSession } from './useRecordedSession';
import styles from './History.module.css';

/** Playback consumes authoritative frames only: no AI, rules execution or match requests. It runs on the ordinary table. */
export function RecordedReplay() {
  const params = useSearchParams(), id = params.get('id');
  // A match of a room one is in: watched by being in it, and left back to it.
  const room = isRoomId(params.get('room')) ? params.get('room') : null;
  const step = Math.max(0, Number(params.get('step')) || 0);
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <main className={styles.replayPage} role="status">{t('認証を確認しています…')}</main>;
  return <IdentityReplay key={`${id}:${room}:${step}:${user?.uid ?? 'guest'}`} id={id} room={room} step={step} />;
}

/** Through the room while this browser is in it, else from one's own history. */
function load(id: string, room: string | null) {
  const member = room ? plazaKey(room)?.token : undefined;
  return room && member ? readRoomRecording(room, id, member).catch(() => readRecording(id)) : readRecording(id);
}

function IdentityReplay({ id, room, step }: { id: string | null; room: string | null; step: number }) {
  const [recording, setRecording] = useState<MatchRecording | null>(null);
  const [error, setError] = useState('');
  const { t, gameText } = useI18n();
  useEffect(() => {
    if (!id || !/^[\da-f-]{36}$/.test(id)) { setError('リプレイが見つかりません'); return; }
    let current = true;
    load(id, room).then(value => {
      if (current) {
        if (value.format !== 1 || !value.match.complete || !value.frames.length) setError('この対戦の完全なリプレイは保存されていません');
        else setRecording(value);
      }
    }, (failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'リプレイを読み込めませんでした'); });
    return () => { current = false; };
  }, [id, room]);
  if (!recording) return <main className={styles.replayPage}><section className={styles.history} role="status"><h1>{t('リプレイ')}</h1><p>{error ? gameText(error) : t('リプレイを読み込んでいます…')}</p><Link href={room ? `/game/room/${room}/` : '/game/battle/history/'}>{t(room ? 'ルームへ戻る' : '対戦履歴へ戻る')}</Link></section></main>;
  return <Player key={recording.match.id} recording={recording} initialStep={step} back={room ? `/game/room/${room}/` : '/game/battle/history/'} />;
}

function Player({ recording, initialStep, back }: { recording: MatchRecording; initialStep: number; back: string }) {
  const router = useRouter();
  const onLeave = useCallback(() => router.push(back), [router, back]);
  const session = useRecordedSession({ recording, initialStep, onLeave });
  return <BoardTable session={session} />;
}
