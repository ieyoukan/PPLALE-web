import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'pplale-highlights-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'highlights.mjs');
await build({
  entryPoints: ['src/components/game/board/assessmentHighlights.ts'],
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent',
});
const { assessmentHighlights } = await import(pathToFileURL(output).href);
const point = (index, win) => ({ index, win, turn: { order: 'first', number: 2 } });

test('highlights rank the largest improvements from each player’s perspective', () => {
  const move = (index, win, actor = 0) => ({ ...point(index, win), command: { type: 'skill', actor, skill: 0 }, label: 'スキルを使う' });
  const points = [point(0, 0.1), move(1, 0.25), move(2, 0.45), move(3, 0.75), move(4, 0.88), move(5, 0.5, 1)];
  assert.deepEqual(assessmentHighlights(points, 0).map(h => h.point.index), [3, 2, 1]);
  const other = assessmentHighlights(points, 1);
  assert.deepEqual(other.map(h => h.point.index), [5]);
  assert.ok(Math.abs(other[0].gain - 0.38) < 1e-9);
});

test('highlights exclude incomplete analysis, opposing moves, turn endings and graded mistakes', () => {
  const move = (index, extra = {}) => ({ ...point(index, 0.8), command: { type: 'play', actor: 0, uid: 'card' }, label: 'カードを出す', ...extra });
  for (const next of [move(2), move(1, { command: { type: 'end', actor: 0 } }), move(1, { command: { type: 'play', actor: 1, uid: 'card' } }), move(1, { grade: 'dubious' }), move(1, { label: undefined }), move(1, { win: 0.3 })]) {
    assert.deepEqual(assessmentHighlights([point(0, 0.2), next], 0), []);
  }
  assert.equal(assessmentHighlights([point(0, 0.2), move(1, { grade: null })], 0).length, 1);
  assert.deepEqual(assessmentHighlights([], 0), []);
});

test('the 12-point boundary works for either side without rounding smaller gains up', () => {
  for (const side of [0, 1]) {
    const win = value => side === 0 ? value : 1 - value;
    const move = value => ({ ...point(1, win(value)), command: { type: 'attack', actor: side, uid: 'card', target: 'leader' }, label: 'お菓子を食べる' });
    assert.equal(assessmentHighlights([point(0, win(0.4)), move(0.52)], side).length, 1);
    assert.equal(assessmentHighlights([point(0, win(0.4)), move(0.519)], side).length, 0);
  }
});
