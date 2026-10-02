import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { validateDeck } from '@pplale/game-core';
import type { Deck } from '@pplale/game-core';
import { gameCatalog } from './catalog';
export interface SavedGameDeck {
    id: string;
    deck: Deck;
    errors: string[];
}
export async function loadGameDecks(uid: string): Promise<SavedGameDeck[]> {
    const snapshot = await getDocs(collection(db, 'users', uid, 'decks'));
    return snapshot.docs.map(document => {
        const raw = document.data();
        const ids = (value: unknown): string[] => Array.isArray(value) && value.every(id => typeof id === 'string') ? value : [];
        const deck: Deck = { name: typeof raw.name === 'string' ? raw.name : '無名のデッキ', yojo: ids(raw.yojoDeckIds), sweet: ids(raw.sweetDeckIds), playable: typeof raw.playableCardId === 'string' ? raw.playableCardId : '' };
        return { id: document.id, deck, errors: validateDeck(deck, gameCatalog) };
    });
}
