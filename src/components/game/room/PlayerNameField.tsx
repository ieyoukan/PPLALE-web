'use client';

// 旧2席ルームの名前入力。新しいルームの名前は、入室時に本人のプロフィールから決める。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { MAX_NAME_LENGTH } from '@pplale/game-core/room';
import { useMyProfileState } from '../social/useMyProfile';
import styles from './Room.module.css';

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
export function NameField({ name, onChange, disabled = false }: { name: string; onChange: (name: string) => void; disabled?: boolean }) {
  const { user } = useAuth();
  return <label className={styles.field}>なまえ（相手に表示されます）
    <input type="text" value={name} readOnly={!!user} disabled={disabled} maxLength={MAX_NAME_LENGTH} placeholder="なまえ" autoComplete="nickname" onChange={event => onChange(event.target.value)} />
    {user && <Link href="/game/profile/">プロフィールで名前を変更 ›</Link>}
  </label>;
}
