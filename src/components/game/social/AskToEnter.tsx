'use client';

// Asking a friend to be let into the room they are in. Their room is not shown (it may be one only
// invited people know of), so the request goes to the friend; those who may invite in that room see
// it on their table and choose. Nothing says whether the friend is in a room at all.
import { useState } from 'react';
import { askToEnter } from '@/lib/game/room/client';
import { PlazaIcon } from '../plaza/PlazaIcon';
import styles from './RoomCard.module.css';

export function AskToEnter({ uid, name }: { uid: string; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  return <button type="button" className={styles.ask} data-state={state} disabled={state === 'busy' || state === 'sent'}
    aria-label={state === 'sent' ? `${name}にリクエストインバイトを送りました` : `${name}にリクエストインバイト`}
    onClick={() => { setState('busy'); askToEnter(uid).then(() => setState('sent'), () => setState('failed')); }}>
    <PlazaIcon name={state === 'sent' ? 'check' : 'requestInvite'} /><span>{state === 'sent' ? '送信済み' : state === 'failed' ? 'もう一度' : 'リクエストインバイト'}</span>
  </button>;
}
