'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import styles from './GuestSignInPrompt.module.css';

/** An optional invitation to keep playing together, shared by the menu and match results. */
export function GuestSignInPrompt({ compact = false, purpose = 'social' }: { compact?: boolean; purpose?: 'social' | 'profile' }) {
  const { user, loading, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  if (user) return null;
  // Reserve the compact row while auth resolves, so the menu's buttons do not jump under a pointer.
  if (loading) return compact ? <div className={styles.placeholder} aria-hidden="true" /> : null;
  const signIn = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await signInWithGoogle(); }
    catch { setError('ログインできませんでした。もう一度お試しください'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className={styles.prompt} data-compact={compact || undefined} aria-label={purpose === 'profile' ? 'プロフィールにログイン' : 'ログインのおすすめ'}>
    <Image className={styles.art} src="/images/game/characters/friends.webp" alt="" width={88} height={76} sizes={compact ? '48px' : '88px'} />
    <div className={styles.copy}><b data-ui-title>{purpose === 'profile' ? '自分のプロフィール' : 'フレンドと、また遊ぼう'}</b><p>{purpose === 'profile' ? 'プロフィールを使うにはログインしてください。' : compact ? 'ログインでフレンド・デッキ共有' : 'ログインして、フレンド登録やデッキの共有を。'}</p></div>
    <OrnateFrame as="button" size="line" className={styles.signIn} disabled={busy} onClick={() => void signIn()} aria-label="Googleでログイン"><span data-ui-title>{busy ? 'ログイン中…' : 'ログイン'}</span></OrnateFrame>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
