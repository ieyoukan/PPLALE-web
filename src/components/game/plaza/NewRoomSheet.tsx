'use client';

import { useState } from 'react';
import { DEFAULT_VISIBILITY } from '@pplale/game-core/room';
import type { RoomVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from './PlazaProvider';
import { RoomDepartureNotice } from './RoomDepartureNotice';
import { Sheet } from './Sheet';
import { visibilityInfo } from './visibility';
import styles from './NewRoomSheet.module.css';

const creationKinds: RoomVisibility[] = ['public', 'friendsPlus', 'friends', 'invitePlus', 'invite'];
/** Choose this room's access at creation; once it exists, access stays fixed. */
export function NewRoomSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const plaza = usePlaza(), view = plaza.view;
  const { user } = useAuth();
  const [visibility, setVisibility] = useState<RoomVisibility>(DEFAULT_VISIBILITY);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const create = async () => {
    setBusy(true); setError('');
    try {
      const made = await plaza.create(visibility);
      if (made) onDone();
      else setError('ルームを作れませんでした。もう一度お試しください');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'ルームを作れませんでした'); }
    finally { setBusy(false); }
  };
  return <Sheet title="新しいルームを作る" onClose={onClose} wide>
    <div className={styles.newRoom}>
      <p className={styles.createPrompt}>公開範囲を選ぶ</p>
      <OrnateFrame size="sm" className={styles.creationKinds} role="radiogroup" aria-label="ルームの公開範囲">{creationKinds.map(kind => {
        const info = visibilityInfo[kind], needsLogin = !user && (kind === 'friends' || kind === 'friendsPlus');
        return <button key={kind} type="button" role="radio" aria-checked={visibility === kind} disabled={busy || needsLogin}
          className={styles.creationKind} onClick={() => setVisibility(kind)}>
          <span className={styles.creationIcon}><GameIcon name={info.icon} />{info.plus && <i>＋</i>}</span>
          <span className={styles.creationText}><b data-ui-title>{info.label}</b><small>{needsLogin ? 'ログインして選べます' : info.note}</small></span>
          <span className={styles.creationCheck} aria-hidden="true">{visibility === kind && <GameIcon name="check" />}</span>
        </button>;
      })}</OrnateFrame>
      <RoomDepartureNotice view={view} />
      {error && <p className={styles.createError} role="alert">{error}</p>}
      <button className={styles.makeButton} disabled={busy} onClick={() => void create()}><GameIcon name="sparkle" /><span data-ui-title>{busy ? '作成中…' : 'この公開範囲で作る'}</span></button>
    </div>
  </Sheet>;
}
