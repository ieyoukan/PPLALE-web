'use client';

import { useState } from 'react';
import { isRoomId, ROOM_ID_LENGTH } from '@pplale/game-core/room';
import { usePlaza } from './PlazaProvider';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomIdEntry.module.css';

/** Public discovery and an invitation's numeric room id meet at the same admission check. */
export function RoomIdEntry({ onEntered }: { onEntered(): void }) {
  const plaza = usePlaza();
  const { t, gameText } = useI18n();
  const [id, setId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className={styles.form} aria-label={t('ルームIDで入る')} onSubmit={event => {
    event.preventDefault(); if (!isRoomId(id) || busy) return;
    setBusy(true); setError('');
    void plaza.go(id).then(onEntered, failure => setError(failure instanceof Error ? failure.message : 'ルームに入れませんでした')).finally(() => setBusy(false));
  }}>
    <label>{t('ルームID')}<input aria-label={t('ルームID')} type="text" inputMode="numeric" autoComplete="off" maxLength={ROOM_ID_LENGTH} placeholder={t('6けたの数字')} value={id} onChange={event => setId(event.target.value.replace(/\D/g, '').slice(0, ROOM_ID_LENGTH))} /></label>
    <button type="submit" disabled={!isRoomId(id) || busy}><GameIcon name="enter" />{t(busy ? '接続中…' : '入る')}</button>
    {error && <p role="alert">{gameText(error)}</p>}
  </form>;
}
