'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { publishRecruitment, readRecruitment } from '@/lib/game/social';
import styles from './Social.module.css';
export function RecruitmentButton({ roomId, hostProfileId }: { roomId: string; hostProfileId?: string }) {
  const { user } = useAuth();
  if (!user || user.uid !== hostProfileId) return null;
  return <Recruitment key={user.uid} roomId={roomId} />;
}
function Recruitment({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [published, setPublished] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let current = true; void readRecruitment().then(value => { if (current) setPublished(value === roomId); }, () => {}).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [roomId]);
  async function change() {
    setBusy(true); setError('');
    try { await publishRecruitment(published ? null : roomId); setPublished(value => !value); }
    catch { setError('募集を変更できませんでした。ログイン状態を確認してください'); }
    finally { setBusy(false); }
  }
  return <div className={styles.actions}><button className={styles.primary} disabled={busy || loading} onClick={() => void change()}>{published ? 'フレンドへの募集を取り下げる' : 'フレンドに対戦を募集する'}</button>{published && <span className={styles.success} role="status">フレンドのソーシャル画面に表示中</span>}{error && <p className={styles.error} role="alert">{error}</p>}</div>;
}
