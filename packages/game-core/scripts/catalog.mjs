// The card catalog for scripts that run the engine in Node (no browser, no Next.js).
import { readFileSync } from 'node:fs';

const data = name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url)))[name];
export const catalog = Object.fromEntries([
  ...data('yojo'), ...data('sweet'), ...data('playable'), ...data('tokenYojo'), ...data('token'),
].map(card => [card.id, card]));
