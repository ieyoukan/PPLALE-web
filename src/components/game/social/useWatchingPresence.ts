'use client';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { publishWatching, WATCHING_BEAT } from '@/lib/game/social';

/** While a signed-in player watches `roomId`, their friends see them in that room. Repeated while the tab is shown; taken back on leaving. */
export function useWatchingPresence(roomId: string | null) {
  const uid = useAuth().user?.uid;
  useEffect(() => {
    if (!uid || !roomId) return;
    const beat = () => { if (!document.hidden) void publishWatching(roomId).catch(() => {}); };
    const leave = () => void publishWatching(null).catch(() => {});
    beat();
    const timer = setInterval(beat, WATCHING_BEAT);
    document.addEventListener('visibilitychange', beat); window.addEventListener('pagehide', leave);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', beat); window.removeEventListener('pagehide', leave); leave(); };
  }, [uid, roomId]);
}
