import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { arena } from '../packages/game-core/tests/helpers.mjs';

const directory = await mkdtemp(join(tmpdir(), 'pplale-room-assessment-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'assessment.mjs');
await build({ entryPoints: ['src/components/game/room/roomAssessment.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
const { appendRoomAssessment, readRoomAssessment, saveRoomAssessment } = await import(pathToFileURL(output).href);
const view = (revision, win = .5, matchId = 'match-a') => ({ matchId, game: { ...arena(), revision }, assessment: { win, method: 'public-position-value-v1' } });

test('only new displayed positions extend the curve; connection-only views never duplicate points', () => {
  const first = appendRoomAssessment([], view(5));
  assert.equal(first.length, 1);
  assert.strictEqual(appendRoomAssessment(first, view(5)), first);
  const next = appendRoomAssessment(first, view(8, .7));
  assert.deepEqual(next.map(p => [p.index, p.win]), [[5, .5], [8, .7]]);
  assert.deepEqual(Object.keys(next[0]).sort(), ['index', 'turn', 'win']);
  assert.strictEqual(appendRoomAssessment(next, { ...view(9), assessment: undefined }), next);
  assert.strictEqual(appendRoomAssessment(next, view(9, NaN)), next);
});

test('a reload restores percentages only for that exact match, dropping future and invalid samples', () => {
  let raw;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => raw, setItem: (_key, value) => { raw = value; } } });
  try {
    const initial = view(5), points = appendRoomAssessment([], initial);
    saveRoomAssessment(initial, points);
    assert.deepEqual(readRoomAssessment(view(6, .6)).map(p => p.index), [5, 6]);
    assert.deepEqual(readRoomAssessment(view(6, .6, 'match-b')).map(p => p.index), [6]);
    assert.deepEqual(readRoomAssessment({ ...view(6), matchId: undefined }).map(p => p.index), [6]);
    const saved = JSON.parse(raw);
    saved.points.push({ ...points[0], index: 500 }, { ...points[0], index: 4, win: 2 }, { ...points[0], command: { private: true } });
    raw = JSON.stringify(saved);
    const restored = readRoomAssessment(view(6));
    assert.deepEqual(restored.map(p => p.index), [5, 6]);
    assert.equal(JSON.stringify(restored).includes('private'), false);
    raw = '{broken';
    assert.deepEqual(readRoomAssessment(view(6)).map(p => p.index), [6]);
  } finally { delete globalThis.sessionStorage; }
});
