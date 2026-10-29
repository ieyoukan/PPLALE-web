'use client';

// フレンドへ入室をリクエストする。非公開ルームの存在や詳細は明かさず、招待できる人が承認する。
import { useState } from 'react';
import { askToEnter } from '@/lib/game/room/client';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './RoomCard.module.css';

export function AskToEnter({ uid, name }: { uid: string; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  return <button type="button" className={styles.ask} data-state={state} disabled={state === 'busy' || state === 'sent'}
    aria-label={state === 'sent' ? `${name}にリクエストインバイトを送りました` : `${name}にリクエストインバイト`}
    onClick={() => { setState('busy'); askToEnter(uid).then(() => setState('sent'), () => setState('failed')); }}>
    <GameIcon name={state === 'sent' ? 'check' : 'requestInvite'} /><span>{state === 'sent' ? '送信済み' : state === 'failed' ? 'もう一度' : 'リクエストインバイト'}</span>
  </button>;
}
