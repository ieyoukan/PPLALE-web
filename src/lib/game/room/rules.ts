// The rules a room is made with: which cards its decks may use. Checked in the browser (to say
// which decks fit) and again on the server (which decides).
import { validateDeck } from '@pplale/game-core';
import type { Catalog, Deck } from '@pplale/game-core';

export const fruits = ['strawberry', 'grape', 'melon', 'orange'] as const;
export type Fruit = typeof fruits[number];
export const fruitNames: Record<Fruit, string> = { strawberry: 'いちご', grape: 'ぶどう', melon: 'めろん', orange: 'おれんじ' };

export interface RoomRules {
  /** Fruits whose 幼女 and お菓子 may be in a deck. */
  fruits: Fruit[];
  /** Whether 拡張プレイアブル may lead a deck. */
  extendedPlayable: boolean;
}
export const defaultRoomRules: RoomRules = { fruits: ['strawberry'], extendedPlayable: false };
/**
 * What the game can play today (see `validateDeck`). A room cannot allow more than this; add a
 * fruit here when its cards are implemented in game-core.
 */
export const playableNow: RoomRules = { fruits: ['strawberry'], extendedPlayable: false };

/** The usable part of anything sent as rules, or null when no fruit is left. */
export function parseRoomRules(value: unknown): RoomRules | null {
  const raw = value as Partial<RoomRules> | null | undefined;
  const chosen = Array.isArray(raw?.fruits) ? fruits.filter(fruit => raw.fruits!.includes(fruit) && playableNow.fruits.includes(fruit)) : [];
  return chosen.length ? { fruits: chosen, extendedPlayable: raw?.extendedPlayable === true && playableNow.extendedPlayable } : null;
}

const isExtended = (catalog: Catalog, id: string) => catalog[id]?.type === 'playable' && (catalog[id].version ?? 'normal') !== 'normal';

/** Why the deck cannot be used in a room with these rules (empty when it can). */
export function roomDeckErrors(deck: Deck, rules: RoomRules, catalog: Catalog): string[] {
  const errors: string[] = [];
  const used = new Set([...deck.yojo, ...deck.sweet].map(id => catalog[id]?.fruit).filter((fruit): fruit is Fruit => fruits.includes(fruit as Fruit)));
  for (const fruit of Array.from(used)) if (!rules.fruits.includes(fruit)) errors.push(`このルームでは${fruitNames[fruit]}のカードを使えません`);
  if (isExtended(catalog, deck.playable) && !rules.extendedPlayable) errors.push('このルームでは拡張プレイアブルを使えません');
  return errors.length ? errors : validateDeck(deck, catalog);
}

/** One line for the lobby and for sharing, e.g. 「フルーツ：いちご ／ 拡張プレイアブル：なし」. */
export const describeRoomRules = (rules: RoomRules) =>
  `フルーツ：${rules.fruits.map(fruit => fruitNames[fruit]).join('・')} ／ 拡張プレイアブル：${rules.extendedPlayable ? 'あり' : 'なし'}`;
