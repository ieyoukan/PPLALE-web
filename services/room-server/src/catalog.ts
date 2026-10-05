// The card catalog, read from the web app's card data (copied into the image next to the engine).
import { readFileSync } from 'node:fs';
import type { Catalog } from '@pplale/game-core';

const directory = process.env.CARD_DATA_DIR ? new URL(`file://${process.env.CARD_DATA_DIR.replace(/\/?$/, '/')}`) : new URL('../../../src/data/', import.meta.url);
const cards = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, directory), 'utf8'))[name] as Catalog[string][];

export const catalog: Catalog = Object.fromEntries(['yojo', 'sweet', 'playable', 'tokenYojo', 'token'].flatMap(cards).map(card => [card.id, card]));
