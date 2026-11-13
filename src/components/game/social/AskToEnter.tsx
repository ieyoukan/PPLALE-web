'use client';

// フレンドへ入室をリクエストする。非公開ルームの存在や詳細は明かさず、招待できる人が承認する。
import { useState } from 'react';
import { askToEnter } from '@/lib/game/room/client';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomCard.module.css';

export function AskToEnter({ uid, name }: { uid: string; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  const { t } = useI18n();
  return <button type="button" className={styles.ask} data-state={state} disabled={state === 'busy' || state === 'sent'}
    aria-label={state === 'sent' ? t('{name}にリクエストインバイトを送りました', { name }) : t('{name}にリクエストインバイト', { name })}
    onClick={() => { setState('busy'); askToEnter(uid).then(() => setState('sent'), () => setState('failed')); }}>
    <GameIcon name={state === 'sent' ? 'check' : 'requestInvite'} /><span>{state === 'sent' ? t('送信済み') : state === 'failed' ? t('もう一度') : t('リクエストインバイト')}</span>
  </button>;
}
