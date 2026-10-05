import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { playMatch, randomStrawberryDeck } from '@pplale/game-core/ai';
import type { Command, Deck } from '@pplale/game-core';
import { catalog } from '../src/catalog.ts';

export { catalog };
export const temporaryDirectory = () => mkdtempSync(path.join(os.tmpdir(), 'cpu-server-'));

/** A finished match as the game would report it (played by two quick CPUs, which is enough here). */
export function playedReport(seed: number) {
    const decks: [Deck, Deck] = [randomStrawberryDeck(seed), randomStrawberryDeck(seed + 1)];
    const commands: Command[] = [];
    const result = playMatch(catalog, { levels: ['hard', 'normal'], seed, decks, onStep: (_state, command) => { commands.push(command); } });
    const plain = ({ yojo, sweet, playable }: Deck) => ({ yojo, sweet, playable });
    return { report: { level: 'master', model: 'test-model', seed, decks: decks.map(plain), commands }, winner: result.winner };
}
