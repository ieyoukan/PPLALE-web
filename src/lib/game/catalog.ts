import yojo from '@/data/yojo.json';
import sweet from '@/data/sweet.json';
import playable from '@/data/playable.json';
import tokenYojo from '@/data/tokenYojo.json';
import token from '@/data/token.json';
import strawberryStableDeckData from '@/data/strawberryStableDeck.json';
import type { Catalog, Deck } from '@pplale/game-core';
import type { CardInfo } from '@/types/card';
import type { TokenCard } from '@/lib/schema';
export const displayCards: Record<string, CardInfo | TokenCard> = Object.fromEntries([
    ...yojo.yojo, ...sweet.sweet, ...playable.playable, ...tokenYojo.tokenYojo, ...token.token,
].map(card => [card.id, card])) as Record<string, CardInfo | TokenCard>;
export const gameCatalog: Catalog = Object.fromEntries(Object.values(displayCards).map(({ id, name, type, fruit, cost, attack, hp, sweetType, role, version }) => [id, { id, name, type, fruit, cost, attack, hp, sweetType, role, version }]));
export const strawberryStableDeck: Deck = strawberryStableDeckData;
export const demoDeck: Deck = { ...strawberryStableDeck, name: 'いちごのおためしデッキ' };
