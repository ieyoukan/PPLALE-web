import yojo from '@/data/yojo.json';
import sweet from '@/data/sweet.json';
import playable from '@/data/playable.json';
import tokens from '@/data/tokenYojo.json';
import type { Catalog, Deck } from '@pplale/game-core';
import type { CardInfo } from '@/types/card';
export const displayCards: Record<string, CardInfo> = Object.fromEntries([
    ...yojo.yojo, ...sweet.sweet, ...playable.playable, ...tokens.tokenYojo,
    { id: 'token_cat', name: '猫まんじゅう', type: 'yojo', fruit: 'strawberry', cost: 1, attack: 1, hp: 1, effect: '効果なし', description: '', imageUrl: '' },
    { id: 'token_pudding', name: 'ギガプリン', type: 'yojo', fruit: 'strawberry', cost: 5, attack: 0, hp: 7, effect: '挑発。防衛。行動不能。', description: '', imageUrl: '' },
].map(card => [card.id, card])) as Record<string, CardInfo>;
export const gameCatalog: Catalog = Object.fromEntries(Object.values(displayCards).map(({ id, name, type, fruit, cost, attack, hp, sweetType, role, version }) => [id, { id, name, type, fruit, cost, attack, hp, sweetType, role, version }]));
export const demoDeck: Deck = {
    name: 'いちごのおためしデッキ',
    yojo: ['y_0', 'y_0', 'y_2', 'y_2', 'y_3', 'y_4', 'y_4', 'y_6', 'y_7', 'y_8', 'y_9', 'y_9', 'y_12', 'y_13', 'y_15', 'y_16', 'y_22', 'y_23', 'y_25', 'y_28'],
    sweet: ['s_0', 's_1', 's_6', 's_7', 's_15', 's_16', 's_17', 's_19', 's_20', 's_22'],
    playable: 'p_0',
};
