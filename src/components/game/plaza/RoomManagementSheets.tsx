'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_ROOM_NAME_LENGTH } from '@pplale/game-core/room';
import type { RoomView } from '@pplale/game-core/room';
import { RulesSheet } from './PlazaSheets';
import { PlazaIcon } from './PlazaIcon';
import { usePlaza } from './PlazaProvider';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { ShareSheet } from './ShareSheet';
import { Sheet } from './Sheet';
import { visibilityInfo } from './visibility';
import styles from './RoomManagementSheets.module.css';

export function RoomNameSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const { send } = usePlaza();
  const [name, setName] = useState(view.plaza!.name);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const chosen = name.trim();
    if (!chosen) return setError('ルーム名を入力してください');
    setBusy(true); setError('');
    try { await send({ action: 'rename', name: chosen }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '名前を変えられませんでした'); }
    finally { setBusy(false); }
  };
  return <Sheet title="ルーム名を変える" onClose={onClose}>
    <form className={styles.nameForm} onSubmit={event => void save(event)}>
      <label htmlFor="plaza-room-name">ルーム名</label>
      <input id="plaza-room-name" value={name} onChange={event => setName(Array.from(event.target.value).slice(0, MAX_ROOM_NAME_LENGTH).join(''))} disabled={busy} autoComplete="off" />
      <small>{Array.from(name).length} / {MAX_ROOM_NAME_LENGTH}</small>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="submit" className={styles.primary} disabled={busy || !name.trim() || name.trim() === view.plaza!.name}>
        <PlazaIcon name="check" />{busy ? '保存中…' : 'この名前にする'}
      </button>
    </form>
  </Sheet>;
}

/** A new room is already joined; these actions can be done before showing its table. */
export function RoomCreatedSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const { send } = usePlaza();
  const [panel, setPanel] = useState<'created' | 'name' | 'rules' | 'share'>('created');
  const [error, setError] = useState('');
  if (panel === 'name') return <RoomNameSheet view={view} onClose={() => setPanel('created')} />;
  if (panel === 'rules') return <RulesSheet view={view} onClose={() => setPanel('created')} onSave={rules => {
    void send({ action: 'rules', rules }).then(() => setError(''), failure => setError(failure instanceof Error ? failure.message : 'ルールを変えられませんでした')).finally(() => setPanel('created'));
  }} />;
  if (panel === 'share') return <ShareSheet view={view} onClose={() => setPanel('created')} />;
  const room = view.plaza!, info = visibilityInfo[room.visibility];
  return <Sheet title="ルームを作りました" onClose={onClose} wide>
    <div className={styles.created}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} alt="ルームのサムネイル" className={styles.thumbnail} sizes="(max-width: 700px) 90vw, 560px" priority />
      <div className={styles.identity}>
        <b data-ui-title>{room.name}</b><span>#{view.id}</span>
        <small><PlazaIcon name={info.icon} />{info.label}</small>
      </div>
      <div className={styles.actions}>
        <button onClick={() => setPanel('name')}><PlazaIcon name="pen" />名前を変える</button>
        <button onClick={() => setPanel('rules')}><PlazaIcon name="star" />ルールを変える</button>
        <button onClick={() => setPanel('share')}><PlazaIcon name="link" />共有リンク</button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} onClick={onClose}><PlazaIcon name="door" />盤面へ</button>
    </div>
  </Sheet>;
}
