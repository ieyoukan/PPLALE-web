'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { defaultProfile, enableSearch, readProfile, saveProfile } from '@/lib/game/social';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { ProfileIconPicker } from './ProfileIconPicker';
import { useOwnProfileOpen } from './ownProfile';
import styles from './ProfileOnboarding.module.css';

/** Mounted only after auth has started and a player is signed in. Never infer a nickname from Google. */
export default function ProfileOnboarding({ uid }: { uid: string }) {
  const { signOut } = useAuth();
  const editingMyProfile = useOwnProfileOpen();
  const [status, setStatus] = useState<'checking' | 'ready' | 'missing' | 'error'>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    const load = () => { void readProfile(uid).then(profile => {
      if (!current) return;
      setStatus(profile ? 'ready' : 'missing');
      // Saved before name search: made findable once (the profile editor offers to opt out).
      if (profile && profile.searchable === undefined) void enableSearch(uid).catch(() => {});
    }, () => { if (current) setStatus('error'); }); };
    load(); window.addEventListener('pplale-profile-updated', load);
    return () => { current = false; window.removeEventListener('pplale-profile-updated', load); };
  }, [uid, attempt]);

  // The profile page already offers the same first-time editor, without a second form over it.
  if (status === 'checking' || status === 'ready' || editingMyProfile) return null;
  return <SetupDialog uid={uid} failed={status === 'error'} onRetry={() => { setStatus('checking'); setAttempt(value => value + 1); }} onComplete={() => setStatus('ready')} onSignOut={signOut} />;
}

function SetupDialog({ uid, failed, onRetry, onComplete, onSignOut }: { uid: string; failed: boolean; onRetry: () => void; onComplete: () => void; onSignOut: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(() => defaultProfile(uid, ''));
  const [choosing, setChoosing] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    nameInput.current?.focus();
    return () => { element?.close(); };
  }, []);
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await saveProfile(profile);
      window.dispatchEvent(new Event('pplale-profile-updated'));
      onComplete();
    } catch { setError('保存できませんでした。接続を確認して、もう一度お試しください'); }
    finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true); setError('');
    try { await onSignOut(); }
    catch { setError('ログアウトできませんでした。もう一度お試しください'); setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="profile-setup-title" aria-describedby="profile-setup-description" onCancel={event => event.preventDefault()}>
    <h2 id="profile-setup-title">はじめまして！</h2>
    <p id="profile-setup-description">{failed ? 'プロフィールを確認できませんでした' : 'みんなに見える名前とアイコンを決めよう'}</p>
    {failed ? <button className={styles.primary} onClick={onRetry}>もう一度読み込む</button> : <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy}>
        <button type="button" className={styles.avatar} onClick={() => setChoosing(value => !value)} aria-label="カードのアイコンを選ぶ" aria-expanded={choosing}>
          <CardArtwork id={profile.iconCardId} sizes="100px" eager /><span><GameIcon name="pen" />変更</span>
        </button>
        <label>なまえ<input ref={nameInput} required maxLength={12} autoComplete="nickname" placeholder="ニックネーム" value={profile.displayName} onChange={event => setProfile({ ...profile, displayName: event.target.value })} /></label>
        <label>ひとこと<input maxLength={80} value={profile.comment} placeholder="よろしくお願いします！" onChange={event => setProfile({ ...profile, comment: event.target.value })} /></label>
        {choosing && <ProfileIconPicker selected={profile.iconCardId} onSelect={iconCardId => { setProfile({ ...profile, iconCardId }); setChoosing(false); }} />}
        <button className={styles.primary} disabled={busy || !profile.displayName.trim()} data-ui-title><GameIcon name="check" />{busy ? '保存中…' : '保存してはじめる'}</button>
      </fieldset>
    </form>}
    {error && <p role="alert">{error}</p>}
    <button className={styles.signOut} disabled={busy} onClick={() => void leave()}>ログアウト</button>
  </dialog>;
}
