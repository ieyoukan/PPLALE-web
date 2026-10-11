'use client';

// The バトル tab: make a room (choosing its rules) or enter one by its id.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { createRoom, keepSeat, latestRoom, readServerStats, roomServerUrl } from '@/lib/game/room/client';
import { MAX_NAME_LENGTH, ROOM_ID_LENGTH, defaultRoomRules, isRoomId } from '@pplale/game-core/room';
import type { RoomRules, RoomServerStats } from '@pplale/game-core/room';
import { ROOM_PATH, roomHref, watchHref } from '@/lib/game/sessionStore';
import { RulePicker } from '../RulePicker';
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

/** Whether the room server can be reached and how busy it is, asked now and every half minute. */
function useServerStats() {
  // undefined: asking. null: no answer.
  const [stats, setStats] = useState<RoomServerStats | null>();
  useEffect(() => {
    if (!roomServerUrl) return setStats(null);
    let current = true;
    const ask = () => readServerStats().then(result => { if (current) setStats(result); }, () => { if (current) setStats(null); });
    void ask();
    const timer = setInterval(ask, 30_000);
    return () => { current = false; clearInterval(timer); };
  }, []);
  return stats;
}
/**
 * Whether room matches can be used now. The counts (/stats) are for whoever runs the server: to a
 * player, "0 rooms recruiting" only reads as "nobody plays", and a room is entered by its id anyway.
 */
function ServerStatus({ stats }: { stats: RoomServerStats | null | undefined }) {
  if (stats === undefined) return <p className={styles.server} role="status"><i className={styles.dot} />ルームサーバーを確認中…</p>;
  if (!stats) return <p className={`${styles.server} ${styles.serverDown}`} role="status"><i className={styles.dot} />
    {roomServerUrl ? 'ルームサーバーにつながりません。しばらくしてからお試しください。' : 'ルームサーバーが設定されていないため、ルームマッチは使えません。'}</p>;
  return <p className={`${styles.server} ${styles.serverUp}`} role="status"><i className={styles.dot} />ルームマッチを利用できます</p>;
}

/** The picture on each door: people watching a table, a door standing open, a new door. */
function DoorArt({ kind }: { kind: 'watch' | 'enter' | 'create' }) {
  if (kind === 'watch') return <svg viewBox="0 0 120 120">
    {/* The table with a match on it, and two people looking on from this side (seen from behind). */}
    <path d="M24 20l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5zM97 12l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#fffdeb" stroke="#6b4a3a" strokeWidth="1.8" strokeLinejoin="round" />
    <ellipse cx="60" cy="56" rx="42" ry="14" fill="#fffdeb" stroke="#6b4a3a" strokeWidth="2.5" />
    <rect x="38" y="34" width="17" height="24" rx="3" fill="#f4b0bb" stroke="#6b4a3a" strokeWidth="2.5" transform="rotate(-10 46 46)" />
    <rect x="65" y="34" width="17" height="24" rx="3" fill="#b3d788" stroke="#6b4a3a" strokeWidth="2.5" transform="rotate(10 74 46)" />
    <path d="M14 116a22 22 0 0 1 44 0z" fill="#e7c3e2" stroke="#6b4a3a" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="36" cy="84" r="13" fill="#c9a27e" stroke="#6b4a3a" strokeWidth="2.5" />
    <path d="M62 116a22 22 0 0 1 44 0z" fill="#fde9a8" stroke="#6b4a3a" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="84" cy="84" r="13" fill="#f4b0bb" stroke="#6b4a3a" strokeWidth="2.5" />
  </svg>;
  return <svg viewBox="0 0 120 120">
    {/* The doorway, with light coming through it. */}
    <path d="M28 108V52a32 32 0 0 1 64 0v56z" fill="#fffdeb" stroke="#6b4a3a" strokeWidth="3" strokeLinejoin="round" />
    <path d="M38 108V54a22 22 0 0 1 44 0v54z" fill={kind === 'enter' ? '#fff6b8' : '#e7c3e2'} stroke="#6b4a3a" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M18 108h84" stroke="#6b4a3a" strokeWidth="3" strokeLinecap="round" />
    {kind === 'enter' ? <>
      {/* The door leaf swung open, and the way in. */}
      <path d="M38 108V54a22 22 0 0 1 4-12l14 10v64z" fill="#f4b0bb" stroke="#6b4a3a" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M96 84H66m10-9-10 9 10 9" fill="none" stroke="#6b4a3a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </> : <>
      <path d="M60 33v75" stroke="#6b4a3a" strokeWidth="2.5" />
      <circle cx="54" cy="78" r="2.6" fill="#6b4a3a" /><circle cx="66" cy="78" r="2.6" fill="#6b4a3a" />
      {/* A new one. */}
      <circle cx="92" cy="30" r="15" fill="#b3d788" stroke="#6b4a3a" strokeWidth="3" />
      <path d="M92 22v16m-8-8h16" stroke="#6b4a3a" strokeWidth="4" strokeLinecap="round" />
    </>}
  </svg>;
}

export function RoomEntrance() {
  const router = useRouter();
  const [open, setOpen] = useState<'create' | 'enter' | 'watch' | null>(null);
  const [name, setName] = usePlayerName();
  const [rules, setRules] = useState<RoomRules>(defaultRoomRules);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<string | null>(null);
  // localStorage is only available in the browser, after the first render.
  useEffect(() => { setLatest(latestRoom()); }, []);

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
  const stats = useServerStats();

  // The doors fill the screen, so the form of the chosen one opens below them: bring it into view.
  const form = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [open]);
  const door = (kind: 'watch' | 'enter' | 'create', label: string, note: string) =>
    <button className={`${styles.door} ${styles[kind]}`} aria-expanded={open === kind} onClick={() => setOpen(open === kind ? null : kind)}>
      <span className={styles.doorArt} aria-hidden="true"><DoorArt kind={kind} /></span>
      <span className={styles.doorPlate}><b>{label}</b><small>{note}</small></span>
    </button>;

  return <div className={styles.stack}>
    {/* What this is on the left; on the right three large doors, one under the other. */}
    <div className={styles.entrance}>
      <div className={styles.intro}>
        <h2>ルームマッチ</h2>
        <p>特定の相手と<br />対戦することができます</p>
        <ServerStatus stats={stats} />
        {latest && <Link href={roomHref(ROOM_PATH, latest)} className={styles.secondary}>前回のルーム（{latest}）に戻る</Link>}
      </div>
      <div className={styles.doors} data-open={open ?? undefined}>
        {door('watch', '観戦する', '観戦できるルームの対戦を見る')}
        {door('enter', 'ルームへ入る', '教えてもらったルームIDで参加する')}
        {door('create', 'ルームを作る', 'ルールを決めて、友だちを招待する')}
      </div>
    </div>
    <div ref={form} className={styles.formAnchor} />
    {open === 'create' && <section className={styles.panel} aria-label="ルームを作る">
      <h2>ルームのルール</h2>
      {/* Which cards the decks may use: the same tiles as before a CPU match. Watching is the room's own. */}
      <RulePicker rules={rules} onChange={next => setRules(current => ({ ...current, ...next }))} />
      <fieldset className={styles.checks}>
        <legend>観戦</legend>
        <div className={styles.checkRow}>
          <label className={styles.check}>
            <input type="checkbox" checked={!!rules.spectators} onChange={event => setRules(current => ({ ...current, spectators: event.target.checked }))} />
            観戦を許可する
          </label>
        </div>
        <p className={styles.note}>観戦している人には、2人の手札が両方とも見えます。ルームIDを知っている人はだれでも観戦できます。</p>
      </fieldset>
      <NameField name={name} onChange={setName} />
      <button className={styles.primary} disabled={busy || stats === null} onClick={create}>{busy ? '作成中…' : 'このルールでルームを作る'}</button>
    </section>}
    {(open === 'enter' || open === 'watch') && <form className={styles.panel} aria-label={open === 'watch' ? '観戦する' : 'ルームへ入る'}
      onSubmit={event => { event.preventDefault(); if (isRoomId(id)) router.push(open === 'watch' ? watchHref(id) : roomHref(ROOM_PATH, id)); }}>
      <h2>{open === 'watch' ? '観戦するルームのIDを入力' : 'ルームIDを入力'}</h2>
      <label className={styles.field}>ルームID（数字{ROOM_ID_LENGTH}けた）
        <input type="text" className={styles.idInput} value={id} inputMode="numeric" autoComplete="off" maxLength={ROOM_ID_LENGTH} placeholder={'0'.repeat(ROOM_ID_LENGTH)}
          onChange={event => setId(event.target.value.replace(/\D/g, '').slice(0, ROOM_ID_LENGTH))} />
      </label>
      <button className={styles.primary} disabled={!isRoomId(id)}>{open === 'watch' ? '観戦する' : 'ルームを見る'}</button>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
