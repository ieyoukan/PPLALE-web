// CPU levels against each other: `npm run cpu:arena -- [games per pair] [levels...]`
// Seats are swapped every other game so the first-player advantage cancels out.
import { readFileSync } from 'node:fs';
import { cpuLevels, playMatch } from '../dist/index.js';

const data = name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url)))[name];
const catalog = Object.fromEntries([
  ...data('yojo'), ...data('sweet'), ...data('playable'), ...data('tokenYojo'),
  { id: 'token_cat', name: '猫まんじゅう', type: 'yojo', fruit: 'strawberry', cost: 1, attack: 1, hp: 1 },
  { id: 'token_pudding', name: 'ギガプリン', type: 'yojo', fruit: 'strawberry', cost: 5, attack: 0, hp: 7 },
].map(card => [card.id, card]));

const games = Number(process.argv[2] ?? 20);
const levels = process.argv.length > 3 ? process.argv.slice(3) : cpuLevels;
for (let i = 0; i < levels.length; i++) {
  for (let j = i + 1; j < levels.length; j++) {
    const [a, b] = [levels[j], levels[i]];
    let wins = 0, draws = 0, ms = 0, decisions = 0;
    for (let seed = 1; seed <= games; seed++) {
      const flip = seed % 2 === 1;
      const result = playMatch(catalog, { levels: flip ? [b, a] : [a, b], seed });
      const seat = flip ? 1 : 0;
      if (result.winner === seat) wins++;
      else if (result.winner === 'draw' || result.winner === null) draws++;
      ms += result.thinking[seat];
      decisions += result.commands / 2;
    }
    console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}  ${wins}/${games} wins (${Math.round(wins / games * 100)}%), ${draws} draws, ${(ms / decisions).toFixed(1)} ms/decision for ${a}`);
  }
}
