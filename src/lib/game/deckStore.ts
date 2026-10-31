'use client';

// ゲーム内のデッキ管理の保存先。ログイン中はサイトの構築ツールと同じFirestore（users/{uid}/decks）、
// ゲストはサイトのゲスト用と同じlocalStorageの形式に書き、どちらの画面でも同じデッキを開ける。
import { nanoid } from 'nanoid';
import { deckRuleErrors, singleCopy, validateDeck } from '@pplale/game-core';
import type { Deck, MatchRules } from '@pplale/game-core';
import { gameCatalog } from './catalog';

export const DECK_LIMITS = { yojo: 20, sweet: 10 } as const;
export type DeckKind = keyof typeof DECK_LIMITS;

/** A saved deck as the game shows it. `playable` is null until one is chosen. */
export interface StoredDeck { id: string; name: string; yojo: string[]; sweet: string[]; playable: string | null; updatedAt: number }
/** What the editor holds: a deck not saved yet has no id. */
export type DeckDraft = Omit<StoredDeck, 'id' | 'updatedAt'> & { id?: string };

/** Sent on window after any save or delete, so lists, rooms and seats read the decks again. */
export const DECKS_CHANGED = 'pplale-decks-changed';
const LOCAL_INDEX = 'localDecks';
const localKey = (id: string, field: 'name' | 'yojo' | 'sweet' | 'playable') => `deck_${id}_${field}`;

const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
/** The site stores guests' cards as card objects ({ id, … }); only the ids are kept. */
const localIds = (raw: string | null): string[] => {
  try { const parsed = raw ? JSON.parse(raw) as unknown : []; return Array.isArray(parsed) ? parsed.map(card => typeof card === 'string' ? card : (card as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
};
const time = (value: unknown) => {
  const date = typeof (value as { toDate?: () => Date })?.toDate === 'function' ? (value as { toDate: () => Date }).toDate() : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
};

async function firestore() {
  const [sdk, { db }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase')]);
  return { sdk, db };
}

/** Every deck of this player (signed in) or of this browser (guest), the most recently changed first. */
export async function listDecks(uid: string | null): Promise<StoredDeck[]> {
  if (!uid) return listLocalDecks();
  const { sdk, db } = await firestore();
  const snapshot = await sdk.getDocs(sdk.collection(db, 'users', uid, 'decks'));
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return { id: doc.id, name: typeof data.name === 'string' ? data.name : '', yojo: ids(data.yojoDeckIds), sweet: ids(data.sweetDeckIds), playable: typeof data.playableCardId === 'string' ? data.playableCardId : null, updatedAt: time(data.updatedAt) };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

function listLocalDecks(): StoredDeck[] {
  try {
    const index = JSON.parse(localStorage.getItem(LOCAL_INDEX) || '[]') as { id?: unknown; updatedAt?: unknown }[];
    return index.flatMap(entry => {
      if (typeof entry?.id !== 'string') return [];
      const id = entry.id, playable = localIds(`[${localStorage.getItem(localKey(id, 'playable')) ?? ''}]`)[0] ?? null;
      return [{ id, name: localStorage.getItem(localKey(id, 'name')) ?? '', yojo: localIds(localStorage.getItem(localKey(id, 'yojo'))), sweet: localIds(localStorage.getItem(localKey(id, 'sweet'))), playable, updatedAt: time(entry.updatedAt) }];
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

/** Saves (creating it when it has no id) and returns the deck's id. Names are trimmed; an empty one is saved as is (shown as untitled). */
export async function saveDeck(uid: string | null, deck: DeckDraft): Promise<string> {
  const id = deck.id ?? nanoid(8), now = new Date(), name = deck.name.trim().slice(0, 200);
  const yojo = deck.yojo.slice(0, DECK_LIMITS.yojo), sweet = deck.sweet.slice(0, DECK_LIMITS.sweet);
  if (uid) {
    const { sdk, db } = await firestore();
    await sdk.setDoc(sdk.doc(db, 'users', uid, 'decks', id), { name, yojoDeckIds: yojo, sweetDeckIds: sweet, playableCardId: deck.playable, updatedAt: now, ...(!deck.id && { createdAt: now }) }, { merge: true });
  } else {
    localStorage.setItem(localKey(id, 'name'), name);
    localStorage.setItem(localKey(id, 'yojo'), JSON.stringify(yojo.map(card => ({ id: card }))));
    localStorage.setItem(localKey(id, 'sweet'), JSON.stringify(sweet.map(card => ({ id: card }))));
    localStorage.setItem(localKey(id, 'playable'), JSON.stringify(deck.playable ? { id: deck.playable } : null));
    const index = (JSON.parse(localStorage.getItem(LOCAL_INDEX) || '[]') as { id?: unknown }[]).filter(entry => entry?.id !== id);
    localStorage.setItem(LOCAL_INDEX, JSON.stringify([{ id, name, createdAt: now, updatedAt: now, userId: 'local' }, ...index]));
  }
  window.dispatchEvent(new CustomEvent(DECKS_CHANGED, { detail: { id } }));
  return id;
}

export async function deleteDeck(uid: string | null, id: string) {
  if (uid) {
    const { sdk, db } = await firestore();
    await sdk.deleteDoc(sdk.doc(db, 'users', uid, 'decks', id));
  } else {
    for (const field of ['name', 'yojo', 'sweet', 'playable'] as const) localStorage.removeItem(localKey(id, field));
    const index = (JSON.parse(localStorage.getItem(LOCAL_INDEX) || '[]') as { id?: unknown }[]).filter(entry => entry?.id !== id);
    localStorage.setItem(LOCAL_INDEX, JSON.stringify(index));
  }
  window.dispatchEvent(new CustomEvent(DECKS_CHANGED, { detail: { id } }));
}

/** Whether one more of `id` fits: the deck's size, and the お菓子 a deck may hold only one of (game-core `singleCopy`). */
export function canAddCard(deck: Pick<DeckDraft, 'yojo' | 'sweet'>, id: string): boolean {
  const kind = gameCatalog[id]?.type;
  if (kind !== 'yojo' && kind !== 'sweet') return false;
  const list = deck[kind];
  return list.length < DECK_LIMITS[kind] && !(singleCopy(gameCatalog, id) && list.includes(id));
}

export const asGameDeck = (deck: DeckDraft): Deck => ({ name: deck.name, yojo: deck.yojo, sweet: deck.sweet, playable: deck.playable ?? '' });
/** Why the deck cannot be played: its size and cards, then (in a room) the room's rules. */
export function deckProblems(deck: DeckDraft, rules?: MatchRules): string[] {
  const game = asGameDeck(deck);
  return [...validateDeck(game, gameCatalog), ...(rules ? deckRuleErrors(game, rules, gameCatalog, 'このルーム') : [])];
}

/** The site's deck code: the cards' numbers, separated by commas, in card order (`y_13` → `13`). */
export const deckCode = (cards: string[]) => [...cards].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true })).map(id => id.replace(/\D/g, '')).join(',');
/** Reads the site's deck code (as its import does): numbers or ids, separated by commas; unknown cards are left out. */
export function parseDeckCode(text: string, kind: DeckKind | 'playable'): string[] {
  const prefix = kind === 'yojo' ? 'y_' : kind === 'sweet' ? 's_' : 'p_';
  return text.split(/[,、\s]+/).map(part => part.replace(/\D/g, '')).filter(Boolean)
    .map(number => `${prefix}${Number.parseInt(number, 10)}`).filter(id => gameCatalog[id]?.type === kind);
}

/** A deck made outside the editor (おまかせ, a code) waits here for the editor to open it. */
let draft: DeckDraft | null = null;
export const setDraft = (deck: DeckDraft) => { draft = deck; };
export const readDraft = () => draft;

/** The deck just saved in the editor: the list opens its popup on the way back. Read on mount, cleared after. */
let focus: string | null = null;
export const setFocus = (id: string) => { focus = id; };
export const peekFocus = () => focus;
export const clearFocus = () => { focus = null; };
