'use client';

// The バトル tab: make a room (choosing its rules) or enter one by its id.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { createRoom, keepSeat, latestRoom, readServerStats, roomServerUrl } from '@/lib/game/room/client';
import { MAX_NAME_LENGTH, ROOM_ID_LENGTH, defaultRoomRules, isRoomId } from '@pplale/game-core/room';
import type { RoomRules, RoomServerStats } from '@pplale/game-core/room';
import { BATTLE_PATH, ROOM_PATH, roomHref, watchHref } from '@/lib/game/sessionStore';
import { RulePicker } from '../RulePicker';
import { BattleIllustration } from './BattleIllustration';
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
    {roomServerUrl ? 'ルームサーバーにつながりません。しばらくしてからお試しください。' : 'ルームサーバーが設定されていないため、オンライン対戦は使えません。'}</p>;
  return <p className={`${styles.server} ${styles.serverUp}`} role="status"><i className={styles.dot} />オンライン対戦を利用できます</p>;
}

/** A different character welcomes players at each entrance. */
function DoorArt({ kind }: { kind: 'watch' | 'enter' | 'create' | 'free' }) {
  return <BattleIllustration kind={kind} sizes="(max-width: 720px) 120px, 210px" />;
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
    {/* What this is on the left; on the right four illustrated entrances. */}
    <div className={styles.entrance}>
      <div className={styles.intro}>
        <h2>オンライン対戦</h2>
        <p>いま遊んでいる人や<br />友だちと対戦しよう</p>
        <ServerStatus stats={stats} />
        {latest && <Link href={roomHref(ROOM_PATH, latest)} className={styles.secondary}>前回のルーム（{latest}）に戻る</Link>}
      </div>
      <div className={styles.doors} data-open={open ?? undefined}>
        <Link href={`${BATTLE_PATH}free/`} className={`${styles.door} ${styles.free}`}>
          <span className={styles.doorArt} aria-hidden="true"><DoorArt kind="free" /></span>
          <span className={styles.doorPlate}><b>フリーマッチ</b><small>対戦相手を自動で探す・ランクなし</small></span>
        </Link>
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
