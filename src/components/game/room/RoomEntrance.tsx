'use client';

// The バトル screen (in the launchpad): free matches, entering a room by its id, and the history.
// Other matches are played at the table of the room the game opens in. The doors are cards in the
// ornament frame; the rest sits on the pad's own paper.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { readServerStats, roomServerUrl } from '@/lib/game/room/client';
import { MAX_NAME_LENGTH, ROOM_ID_LENGTH, isRoomId } from '@pplale/game-core/room';
import type { RoomServerStats } from '@pplale/game-core/room';
import { BATTLE_PATH, HOME_PATH, roomHref } from '@/lib/game/sessionStore';
import { BattleIllustration } from './BattleIllustration';
import { BattleCompanion } from './BattleCompanion';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { PlazaIcon } from '../plaza/PlazaIcon';
import styles from './Room.module.css';
import { useMyProfileState } from '../social/useMyProfile';

const NAME_KEY = 'pplale-guest-name-v2';
/** Signed-in names belong to the public profile; only guests choose a name here. */
export function usePlayerName() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useMyProfileState();
  const [guestName, setGuestName] = useState('');
  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* Asked again next time. */ }
    if (saved) setGuestName(saved);
  }, []);
  const ready = !loading && !profileLoading;
  const shown = user ? profile?.displayName ?? 'プレイヤー' : guestName;
  const change = (value: string) => {
    if (!user && !loading) {
      setGuestName(value);
      try { localStorage.setItem(NAME_KEY, value); } catch { /* Kept for this visit only. */ }
    }
  };
  return [Array.from(shown).slice(0, MAX_NAME_LENGTH).join(''), change, ready] as const;
}
export function NameField({ name, onChange, publicName = false, disabled = false }: { name: string; onChange: (name: string) => void; publicName?: boolean; disabled?: boolean }) {
  const { user } = useAuth();
  return <label className={styles.field}>なまえ（{publicName ? '対戦一覧に表示されます' : '相手に表示されます'}）
    <input type="text" value={name} readOnly={!!user} disabled={disabled} maxLength={MAX_NAME_LENGTH} placeholder="なまえ" autoComplete="nickname" onChange={event => onChange(event.target.value)} />
    {user && <Link href="/game/profile/">プロフィールで名前を変更 ›</Link>}
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
/** Show a warning only when the server cannot be reached. */
function ServerStatus({ stats }: { stats: RoomServerStats | null | undefined }) {
  if (stats !== null) return null;
  return <p className={`${styles.server} ${styles.serverDown}`} role="status"><i className={styles.dot} />
    対戦サーバーにつながりません。しばらくしてからお試しください。</p>;
}

/** A different character welcomes players at each entrance. */
function DoorArt({ kind }: { kind: 'watch' | 'enter' | 'create' | 'free' }) {
  return <BattleIllustration kind={kind} sizes="(max-width: 720px) 120px, 210px" />;
}

export function RoomEntrance() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const stats = useServerStats();
  // The doors fill the screen, so the form opens below them: bring it into view.
  const form = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [open]);

  return <div className={`${styles.stack} ${styles.padScreen}`}>
    <nav className={styles.historyLinks} aria-label="記録">
      <Link href={`${BATTLE_PATH}history/`} className={styles.historyLink}><PlazaIcon name="history" />対戦履歴</Link>
      <Link href="/game/performance/" prefetch={false} className={styles.historyLink}><PlazaIcon name="timer" />通信計測</Link>
    </nav>
    {/* A portrait guide beside the battle actions. */}
    <div className={styles.entrance}>
      <BattleCompanion />
      <div className={styles.battleActions}>
        <ServerStatus stats={stats} />
        <div className={styles.doors} data-open={open ? 'enter' : undefined}>
          <OrnateFrame as={Link} size="sm" href={`${BATTLE_PATH}free/`} className={`${styles.door} ${styles.free}`}>
            <span className={styles.doorArt} aria-hidden="true"><DoorArt kind="free" /></span>
            <span className={styles.doorPlate}><b data-ui-title>フリーマッチ</b><small>対戦相手を自動で探す</small></span>
          </OrnateFrame>
          <OrnateFrame as={Link} size="sm" href={HOME_PATH} className={`${styles.door} ${styles.create}`}>
            <span className={styles.doorArt} aria-hidden="true"><DoorArt kind="create" /></span>
            <span className={styles.doorPlate}><b data-ui-title>ルームへもどる</b><small>フリーマッチ以外の対戦はルームで</small></span>
          </OrnateFrame>
          <OrnateFrame as="button" size="sm" className={`${styles.door} ${styles.enter}`} aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className={styles.doorArt} aria-hidden="true"><DoorArt kind="enter" /></span>
            <span className={styles.doorPlate}><b data-ui-title>IDでルームへ</b><small>教えてもらった6けたの数字で</small></span>
          </OrnateFrame>
        </div>
      </div>
    </div>
    <div ref={form} className={styles.formAnchor} />
    {open && <OrnateFrame as="form" size="sm" faint className={styles.idForm} aria-label="ルームIDでルームへ"
      onSubmit={(event: FormEvent) => { event.preventDefault(); if (isRoomId(id)) router.push(roomHref(id)); }}>
      <h3 data-ui-title>ルームIDを入力</h3>
      <label className={styles.field}>ルームID（数字{ROOM_ID_LENGTH}けた）
        <input type="text" className={styles.idInput} value={id} inputMode="numeric" autoComplete="off" maxLength={ROOM_ID_LENGTH} placeholder={'0'.repeat(ROOM_ID_LENGTH)}
          onChange={event => setId(event.target.value.replace(/\D/g, '').slice(0, ROOM_ID_LENGTH))} />
      </label>
      <OrnateFrame as="button" size="sm" className={styles.cardButton} disabled={!isRoomId(id)}><span data-ui-title>ルームへ行く</span></OrnateFrame>
    </OrnateFrame>}
  </div>;
}
