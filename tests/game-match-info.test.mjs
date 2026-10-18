import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'pplale-match-info-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'match-info.mjs');
await build({ entryPoints: ['src/components/game/board/matchInfo.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
const { cardCounts, countCards, logTurns } = await import(pathToFileURL(output).href);

test('counts preserve repeated plays, strawberry uyuchi variants and actual mochida departures', () => {
  const catalog = {
    base: { name: 'うゆち', type: 'yojo', fruit: 'strawberry' },
    variant: { name: '少女うゆち', type: 'yojo', fruit: 'strawberry' },
    melon: { name: 'うゆち', type: 'yojo', fruit: 'melon' },
    cake: { name: 'ケーキ', type: 'sweet', sweetType: 'cake' },
    currency: { type: 'sweet', sweetType: 'currency' }, back: { type: 'sweet', sweetType: 'back_menu' },
    s_38: { type: 'sweet' },
  };
  assert.deepEqual(cardCounts({ played: ['base', 'variant', 'base', 'melon', 'cake', 'cake', 'currency', 'back', 's_38', 'unknown'], mochidaLeft: 10 }, catalog), { uyuchi: 3, sweets: 2, sweetKinds: 1, mochida: 10 });
  assert.deepEqual(cardCounts({ played: [] }, catalog), { uyuchi: 0, sweets: 0, sweetKinds: 0, mochida: 0 });
});

test('deck grouping counts copies without sorting or modifying the submitted list', () => {
  const cards = ['b', 'a', 'b'];
  assert.deepEqual(countCards(cards), [{ id: 'b', count: 2 }, { id: 'a', count: 1 }]);
  assert.deepEqual(cards, ['b', 'a', 'b']);
});

test('log groups run oldest first and keep effects in their original order', () => {
  const groups = logTurns(['準備', 'Aの1ターン目', 'プレイ', 'ダメージ', 'Bの1ターン目', 'ドロー'], ['A', 'B']);
  assert.deepEqual(groups.map(g => g.title), ['準備・これまでの履歴', 'Aの1ターン目', 'Bの1ターン目']);
  assert.deepEqual(groups[1].lines.map(l => l.text), ['プレイ', 'ダメージ']);
  assert.equal(groups[2].side, 1);
  assert.deepEqual(logTurns([], ['A', 'B']), []);
});
