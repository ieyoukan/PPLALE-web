'use client';

// 名前・プロフィールのリンクでユーザーを探す。検索はログイン中だけサーバー経由で行う（プロフィールの一覧取得はできない）。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { searchProfiles } from '@/lib/game/social';
import type { PlayerProfile } from '@/lib/game/social';
import { profileIdFrom } from '@/lib/game/profileSearch';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { FriendTile } from './FriendTile';
import styles from './Social.module.css';

interface Found { query: string; profiles: PlayerProfile[]; failed?: boolean }

export function UserSearch() {
  const [text, setText] = useState(''), [found, setFound] = useState<Found | null>(null);
  const query = text.trim(), id = profileIdFrom(query);
  useEffect(() => {
    if (!query || id) return;
    const controller = new AbortController();
    // Wait for typing to pause, and drop answers to older words.
    const timer = setTimeout(() => void searchProfiles(query, controller.signal).then(
      profiles => setFound({ query, profiles }),
      () => { if (!controller.signal.aborted) setFound({ query, profiles: [], failed: true }); },
    ), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, id]);
  const shown = found?.query === query && !id ? found : null;
  return <section className={styles.search} role="search" aria-label="ユーザー検索">
    <label data-searching={(!!query && !id && !shown) || undefined}>
      <GameIcon name="search" />
      <input type="search" value={text} onChange={event => setText(event.target.value)} placeholder="なまえ・プロフィールのリンク" aria-label="ユーザーをさがす" enterKeyHint="search" maxLength={300} />
    </label>
    {id && <Link className={styles.primary} href={`/game/profile/?id=${encodeURIComponent(id)}`}>プロフィールを見る ›</Link>}
    {shown && (shown.profiles.length > 0
      ? <div className={styles.tiles}>{shown.profiles.map(profile => <FriendTile key={profile.uid} profile={profile} place="found" status="" />)}</div>
      : <p className={styles.searchEmpty} role="status">{shown.failed ? '検索できませんでした' : '見つかりませんでした'}</p>)}
  </section>;
}
