import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// The one rule behind the replay's timeline and 形勢の詳細 (src/components/game/board/assessmentMarks.ts).
const directory = await mkdtemp(join(tmpdir(), 'pplale-marks-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'marks.mjs');
await build({
  entryPoints: ['src/components/game/board/assessmentMarks.ts'],
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent',
});
const { SWING, changeBetween, markOf } = await import(pathToFileURL(output).href);
const point = (index, win, extra = {}) => ({ index, win, turn: { order: 'first', number: 2 }, ...extra });
const move = (index, win, actor = 0, extra = {}) => point(index, win, { command: { type: 'skill', actor, skill: 0 }, label: 'スキルを使う', ...extra });

test('a swing of 12 points is marked for either side, whoever made the move', () => {
  for (const side of [0, 1]) {
    const win = value => side === 0 ? value : 1 - value;
    for (const actor of [0, 1]) {
      assert.equal(markOf(point(0, win(0.4)), move(1, win(0.52), actor), side), 'up');
      assert.equal(markOf(point(0, win(0.4)), move(1, win(0.519), actor), side), null);
      assert.equal(markOf(point(0, win(0.6)), move(1, win(0.48), actor), side), 'down');
      assert.equal(markOf(point(0, win(0.6)), move(1, win(0.481), actor), side), null);
    }
  }
  assert.equal(SWING, 0.12);
});

test('a side’s own graded move keeps its grade; the other side’s grade is not this side’s mark', () => {
  assert.equal(markOf(point(0, 0.5), move(1, 0.49, 0, { grade: 'dubious' }), 0), 'dubious');
  assert.equal(markOf(point(0, 0.5), move(1, 0.2, 0, { grade: 'blunder' }), 0), 'blunder');
  assert.equal(markOf(point(0, 0.5), move(1, 0.8, 1, { grade: 'blunder' }), 0), 'up');
  assert.equal(markOf(point(0, 0.5), move(1, 0.49, 1, { grade: 'dubious' }), 0), null);
});

test('positions are compared across a gap of up to 3 (as the replay’s timeline does), never further', () => {
  assert.ok(Math.abs(changeBetween(point(0, 0.2), move(3, 0.5), 0) - 0.3) < 1e-9);
  assert.equal(changeBetween(point(0, 0.2), move(4, 0.5), 0), null);
  assert.equal(markOf(point(0, 0.2), move(4, 0.9), 0), null);
});
