'use client';
import { useEffect, useState } from 'react';
import { respondFriend, watchSocial } from '@/lib/game/social';
import type { Friendship, SocialPlayer } from '@/lib/game/social';

/** The signed-in player's friendships, watched only while a social screen is open, and answering one. */
export function useSocial(uid: string) {
  const [players, setPlayers] = useState<SocialPlayer[]>([]);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState('');
  useEffect(() => watchSocial(uid, value => { setPlayers(value); setLoading(false); }, () => { setError('フレンドを読み込めませんでした'); setLoading(false); }), [uid]);
  async function respond(friendship: Friendship, accept: boolean) {
    if (busy) return false;
    setBusy(friendship.id); setError('');
    try { await respondFriend(friendship, accept); return true; }
    catch { setError('変更できませんでした。もう一度お試しください'); return false; }
    finally { setBusy(''); }
  }
  const pending = (mine: boolean) => players.filter(player => player.friendship.status === 'pending' && (player.friendship.requestedBy === uid) === mine);
  return { players, friends: players.filter(player => player.friendship.status === 'accepted'), received: pending(false), sent: pending(true), error, loading, busy, respond };
}
