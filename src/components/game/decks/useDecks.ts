'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { DECKS_CHANGED, listDecks } from '@/lib/game/deckStore';
import type { StoredDeck } from '@/lib/game/deckStore';

/** This player's decks (this browser's as a guest), read again after every save or delete. `uid`: where they are saved. */
export function useDecks() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<{ owner: string | null; decks: StoredDeck[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (authLoading) return;
    let current = true;
    const load = () => listDecks(uid).then(decks => { if (current) setState({ owner: uid, decks, failed: false }); }, () => { if (current) setState(previous => ({ owner: uid, decks: previous?.owner === uid ? previous.decks : [], failed: true })); });
    void load();
    window.addEventListener(DECKS_CHANGED, load);
    return () => { current = false; window.removeEventListener(DECKS_CHANGED, load); };
  }, [uid, authLoading]);
  // Never show another account's decks while the new one's are on their way.
  const mine = state?.owner === uid ? state : null;
  return { uid, decks: mine?.decks ?? [], loading: authLoading || !mine, failed: !!mine?.failed };
}
