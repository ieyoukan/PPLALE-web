// The card catalog for scripts that run the engine in Node (no browser, no Next.js).
import { readFileSync } from 'node:fs';

const data = name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url)))[name];
export const catalog = Object.fromEntries([
  ...data('yojo'), ...data('sweet'), ...data('playable'), ...data('tokenYojo'),
  { id: 'token_cat', name: '猫まんじゅう', type: 'yojo', fruit: 'strawberry', cost: 1, attack: 1, hp: 1 },
  { id: 'token_pudding', name: 'ギガプリン', type: 'yojo', fruit: 'strawberry', cost: 5, attack: 0, hp: 7 },
].map(card => [card.id, card]));
