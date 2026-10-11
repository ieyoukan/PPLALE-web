'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter } from 'firebase/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const PAGE_SIZE = 12;

export interface SavedDeckSummary {
  id: string;
  name: string;
  updatedAt: Date | null;
  yojoDeckIds: string[];
  sweetDeckIds: string[];
  playableCardId: string | null;
  is2pick: boolean;
}

const cardIds = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

function summary(document: QueryDocumentSnapshot): SavedDeckSummary {
  const data = document.data();
  const updatedAt = typeof data.updatedAt?.toDate === 'function' ? data.updatedAt.toDate() : null;
  return {
    id: document.id,
    name: typeof data.name === 'string' ? data.name : '',
    updatedAt: updatedAt instanceof Date && Number.isFinite(updatedAt.getTime()) ? updatedAt : null,
    yojoDeckIds: cardIds(data.yojoDeckIds),
    sweetDeckIds: cardIds(data.sweetDeckIds),
    playableCardId: typeof data.playableCardId === 'string' ? data.playableCardId : null,
    is2pick: data.is2pick === true,
  };
}

/** Each mounted user gets its own cursor; old requests cannot populate a new user's list. */
export function useSavedDeckPages(userId: string) {
  const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<() => Promise<void>>(async () => {});
  const deleted = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let pending = false;
    let finished = false;
    let cursor: QueryDocumentSnapshot | undefined;
    deleted.current = new Set();
    setDecks([]);
    setHasMore(true);
    setError(false);

    async function nextPage() {
      if (!active || pending || finished) return;
      pending = true;
      setIsLoading(true);
      setError(false);
      try {
        const decksRef = collection(db, 'users', userId, 'decks');
        const constraints = [orderBy('updatedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)];
        const snapshot = await getDocs(query(decksRef, ...constraints));
        if (!active) return;
        const page = snapshot.docs.map(summary).filter(deck => !deleted.current.has(deck.id));
        cursor = snapshot.docs.at(-1) ?? cursor;
        finished = snapshot.size < PAGE_SIZE;
        setDecks(previous => [...new Map([...previous, ...page].map(deck => [deck.id, deck])).values()]);
        setHasMore(!finished);
      } catch (problem) {
        if (active) {
          console.error('デッキの取得に失敗しました:', problem);
          setError(true);
        }
      } finally {
        pending = false;
        if (active) setIsLoading(false);
      }
    }

    request.current = nextPage;
    void nextPage();
    return () => { active = false; };
  }, [userId]);

  const loadMore = useCallback(() => request.current(), []);
  const removeDeck = useCallback((id: string) => {
    deleted.current.add(id);
    setDecks(previous => previous.filter(deck => deck.id !== id));
  }, []);

  return { decks, isLoading, hasMore, error, loadMore, removeDeck };
}
