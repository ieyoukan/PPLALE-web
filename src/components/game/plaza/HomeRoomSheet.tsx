'use client';

import { useRef, useState } from 'react';
import { readRoomSettings } from '@/lib/game/plazaSettings';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from './PlazaProvider';
import { RoomDepartureNotice } from './RoomDepartureNotice';
import { Sheet } from './Sheet';
import { visibilityInfo } from './visibility';
import styles from './HomeRoomSheet.module.css';

export function HomeRoomSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const plaza = usePlaza();
  const [visibility] = useState(() => readRoomSettings().homeVisibility);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const moving = useRef(false);
  const move = async () => {
    if (moving.current) return;
    moving.current = true;
    setBusy(true); setError('');
    try {
      if (await plaza.newHome()) onDone();
      else { plaza.settle(); setError('ホームルームを作れませんでした。もう一度お試しください'); }
    } catch (failure) {
      plaza.settle();
      setError(failure instanceof Error ? failure.message : 'ホームルームへ移動できませんでした');
    } finally { moving.current = false; setBusy(false); }
  };
  return <Sheet title="ホームへ移動しますか？" onClose={() => { if (!moving.current) onClose(); }}>
    <div className={styles.confirm}>
      <GameIcon name="home" className={styles.homeIcon} />
      <p>新しいホームルームを作って移動します。</p>
      <span className={styles.visibility}><GameIcon name={visibilityInfo[visibility].icon} />{visibilityInfo[visibility].label}</span>
      <RoomDepartureNotice view={plaza.view} />
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>キャンセル</button>
        <OrnateFrame as="button" size="line" className={styles.move} disabled={busy} onClick={() => void move()}><GameIcon name="home" /><span data-ui-title>{busy ? '移動中…' : '移動する'}</span></OrnateFrame>
      </div>
    </div>
  </Sheet>;
}
