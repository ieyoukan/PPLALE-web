import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { arena, catalog, field, run } from '../packages/game-core/tests/helpers.mjs';

const directory = await mkdtemp(join(tmpdir(), 'pplale-assessment-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'assessment.mjs');
await build({
  stdin: { contents: "export * from './src/components/game/board/assess'; export * from './src/components/game/board/assessmentCache'; export * from './services/room-server/src/history/capture';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent',
});
const { assessMatch, syncAssessment, readAssessment, saveAssessment, captureState } = await import(pathToFileURL(output).href);
const point = (index, win = 0.6) => ({ index, win, turn: { order: 'first', number: 2 } });
const attack = s => ({ type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' });

test('assessment cache retains future points while replaying a shorter prefix', () => {
  const initial = arena(), commands = [{ type: 'end', actor: 0 }, { type: 'choose', actor: 1, option: 'yojo' }];
  const saved = syncAssessment(null, initial, 0, commands);
  saved.points = [point(0), point(1), point(2)];
  assert.deepEqual(syncAssessment(saved, initial, 0, []).points, saved.points);
  assert.deepEqual(syncAssessment(saved, initial, 0, commands.slice(0, 1)).commands, commands);
});

test('a different move after undo discards only the divergent part of the saved curve', () => {
  const initial = arena(), commands = [{ type: 'end', actor: 0 }, { type: 'choose', actor: 1, option: 'yojo' }];
  const saved = syncAssessment(null, initial, 0, commands);
  saved.points = [point(0), point(1), point(2, 0.9)];
  const changed = [commands[0], { ...commands[1], option: 'sweet' }];
  const next = syncAssessment(saved, initial, 0, changed);
  assert.deepEqual(next.points.map(p => p.index), [0, 1]);
  assert.deepEqual(next.commands, changed);
  assert.equal(saved.points.length, 3);
});

test('a different match or viewer never reuses the old assessment', () => {
  const initial = arena(), saved = syncAssessment(null, initial, 0, []);
  saved.points = [point(0)];
  assert.equal(syncAssessment(saved, initial, 1, []).points.length, 0);
  const changed = structuredClone(initial); changed.rng++;
  assert.equal(syncAssessment(saved, changed, 0, []).points.length, 0);
});

test('saved assessment survives a browser storage round trip; invalid values are ignored', () => {
  let stored = null;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (_key, value) => { stored = value; }, getItem: () => stored } });
  try {
    const saved = syncAssessment(null, arena(), 0, []); saved.points = [point(0)];
    saveAssessment(saved);
    assert.deepEqual(readAssessment(), saved);
    saved.points.push(point(1), point(0, -1));
    saveAssessment(saved);
    assert.deepEqual(readAssessment().points, [point(0)]);
    stored = '{broken'; assert.equal(readAssessment(), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('current assessment is yielded before older positions and the slower move grade', () => {
  const initial = arena({ me: { field: ['y_10'] }, foe: { points: 2 } });
  const commands = [attack(initial)], current = run(initial, commands[0]);
  const known = new Map([[0, point(0, 1)]]);
  const steps = assessMatch({ initial, current, commands, viewer: 0 }, known);
  const latest = steps.next().value;
  assert.equal(latest.index, 1);
  assert.equal(latest.win, 1);
  assert.equal(latest.graded, undefined);
  const rest = [...steps];
  assert.ok(rest.some(p => p.index === 1 && p.graded));
  assert.equal(known.get(1).loss, 0);
});

test('replay uses the recorded estimate rather than calculating a different one', () => {
  const initial = arena({ me: { field: ['y_10'] }, foe: { points: 2 } });
  const cached = point(0, 0.61);
  const steps = assessMatch({ initial, current: initial, commands: [], viewer: 0 }, new Map([[0, cached]]));
  assert.equal(steps.next().value, cached);
});

test('live play postpones move grading until the result screen', () => {
  const initial = arena(), commands = [{ type: 'end', actor: 0 }], current = run(initial, commands[0]);
  const known = new Map([[0, point(0)], [1, point(1)]]);
  const points = [...assessMatch({ initial, current, commands, viewer: 0 }, known)];
  assert.ok(points.every(p => !p.graded));
  assert.equal(known.get(1).command.type, 'end');
});

test('room frames save their original position estimate and terminal result without mutating the game', () => {
  const state = arena(), before = JSON.stringify(state);
  const captured = captureState(state, catalog, 'catalog', 'engine');
  assert.ok(captured.presentation.assessment.win >= 0 && captured.presentation.assessment.win <= 1);
  assert.equal(captured.presentation.assessment.method, 'position-value-v1');
  assert.equal(JSON.stringify(state), before);
  for (const winner of [0, 1]) {
    state.winner = winner;
    assert.equal(captureState(state, catalog, 'catalog', 'engine').presentation.assessment.win, winner === 0 ? 1 : 0);
  }
  state.phase = 'dice'; state.winner = null;
  assert.equal(captureState(state, catalog, 'catalog', 'engine').presentation.assessment, undefined);
});
