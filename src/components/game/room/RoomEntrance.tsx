'use client';

// The バトル tab: make a room (choosing its rules) or enter one by its id.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { createRoom, keepSeat, latestRoom } from '@/lib/game/room/client';
import { defaultRoomRules, fruitNames, fruits, playableNow } from '@/lib/game/room/rules';
import type { Fruit, RoomRules } from '@/lib/game/room/rules';
import { MAX_NAME_LENGTH, ROOM_ID_LENGTH, isRoomId } from '@/lib/game/room/types';
import { ROOM_PATH, roomHref } from '@/lib/game/sessionStore';
import tiles from '../home/CardsMenu.module.css';
import styles from './Room.module.css';

const NAME_KEY = 'pplale-room-name-v1';
/** The name shown to the other player: what was typed last, else the signed-in name. */
export function usePlayerName() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* Asked again next time. */ }
    if (saved) { setName(saved); setTyped(true); }
  }, []);
  const shown = typed ? name : Array.from(user?.displayName ?? '').slice(0, MAX_NAME_LENGTH).join('');
  const change = (value: string) => {
    setName(value);
    setTyped(true);
    try { localStorage.setItem(NAME_KEY, value); } catch { /* Kept for this visit only. */ }
  };
  return [shown, change] as const;
}
export function NameField({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  return <label className={styles.field}>なまえ（相手に表示されます）
    <input type="text" value={name} maxLength={MAX_NAME_LENGTH} placeholder="なまえ" autoComplete="nickname" onChange={event => onChange(event.target.value)} />
  </label>;
}

export function RoomEntrance() {
  const router = useRouter();
  const [open, setOpen] = useState<'create' | 'enter' | null>(null);
  const [name, setName] = usePlayerName();
  const [rules, setRules] = useState<RoomRules>(defaultRoomRules);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<string | null>(null);
  // localStorage is only available in the browser, after the first render.
  useEffect(() => { setLatest(latestRoom()); }, []);

  const toggleFruit = (fruit: Fruit, on: boolean) => setRules(current => ({ ...current, fruits: fruits.filter(f => f === fruit ? on : current.fruits.includes(f)) }));
  async function create() {
    setBusy(true);
    setError('');
    try {
      const { view, ...seat } = await createRoom(rules, name);
      keepSeat(view.id, seat);
      router.push(roomHref(ROOM_PATH, view.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ルームを作れませんでした');
      setBusy(false);
    }
  }
  const waiting = fruits.some(fruit => !playableNow.fruits.includes(fruit)) || !playableNow.extendedPlayable;

  return <div className={styles.stack}>
    {latest && <Link href={roomHref(ROOM_PATH, latest)} className={styles.secondary}>前回のルーム（{latest}）に戻る</Link>}
    <div className={tiles.tiles}>
      <button className={`${tiles.tile} ${styles.tileButton}`} aria-expanded={open === 'create'} onClick={() => setOpen(open === 'create' ? null : 'create')}><b>ルームを作る</b><span>ルールを決めて、友だちを招待する</span></button>
      <button className={`${tiles.tile} ${styles.tileButton}`} aria-expanded={open === 'enter'} onClick={() => setOpen(open === 'enter' ? null : 'enter')}><b>ルームへ入る</b><span>教えてもらったルームIDで参加する</span></button>
    </div>
    {open === 'create' && <section className={styles.panel} aria-label="ルームを作る">
      <h2>ルームのルール</h2>
      <fieldset className={styles.checks}>
        <legend>使えるフルーツ</legend>
        <div className={styles.checkRow}>{fruits.map(fruit => {
          const playable = playableNow.fruits.includes(fruit);
          return <label key={fruit} className={styles.check}>
            <input type="checkbox" checked={rules.fruits.includes(fruit)} disabled={!playable} onChange={event => toggleFruit(fruit, event.target.checked)} />
            {fruitNames[fruit]}{!playable && <small>準備中</small>}
          </label>;
        })}</div>
      </fieldset>
      <fieldset className={styles.checks}>
        <legend>プレイアブル</legend>
        <div className={styles.checkRow}>
          <label className={styles.check}>
            <input type="checkbox" checked={rules.extendedPlayable} disabled={!playableNow.extendedPlayable} onChange={event => setRules(current => ({ ...current, extendedPlayable: event.target.checked }))} />
            拡張プレイアブルも使える{!playableNow.extendedPlayable && <small>準備中</small>}
          </label>
        </div>
      </fieldset>
      {waiting && <p className={styles.note}>「準備中」のカードは、まだ対戦で動かせないため選べません。対応したものから選べるようになります。</p>}
      <NameField name={name} onChange={setName} />
      <button className={styles.primary} disabled={busy || !rules.fruits.length} onClick={create}>{busy ? '作成中…' : 'このルールでルームを作る'}</button>
      {!rules.fruits.length && <p className={styles.note}>使えるフルーツを1つ以上選んでください。</p>}
    </section>}
    {open === 'enter' && <form className={styles.panel} aria-label="ルームへ入る" onSubmit={event => { event.preventDefault(); if (isRoomId(id)) router.push(roomHref(ROOM_PATH, id)); }}>
      <h2>ルームIDを入力</h2>
      <label className={styles.field}>ルームID（数字{ROOM_ID_LENGTH}けた）
        <input type="text" className={styles.idInput} value={id} inputMode="numeric" autoComplete="off" maxLength={ROOM_ID_LENGTH} placeholder={'0'.repeat(ROOM_ID_LENGTH)}
          onChange={event => setId(event.target.value.replace(/\D/g, '').slice(0, ROOM_ID_LENGTH))} />
      </label>
      <button className={styles.primary} disabled={!isRoomId(id)}>ルームを見る</button>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
