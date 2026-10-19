import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, restoreGame, viewFor } from '../dist/index.js';
import { cpuCommand, legalMoves } from '../dist/ai/index.js';
import { arena, catalog, choose, optionIds, run } from './helpers.mjs';

const faces = ['1', '2', '3', '4', '5', '6'];
function waiting(uses = 1, count = 1) {
  const s = arena();
  s.players[0].exSkills = { dice: { uses } };
  s.queue = Array.from({ length: count }, () => ({ op: 'die', actor: 0 }));
  return run(s, { type: 'adjust', actor: 0, resource: 'pp', delta: 0 }, true);
}
function legacy() {
  const s = waiting();
  s.pending.prompt = 'クマはサイコロを振らない：出目を指定しますか？';
  s.pending.options.unshift({ id: 'roll', label: '使わずに振る' });
  return s;
}

test('クマはサイコロを振らない automatically requires one of the six faces', () => {
  const s = waiting();
  assert.deepEqual(optionIds(s), faces);
  assert.match(s.pending.prompt, /出目を指定してください/);
  for (const option of ['roll', 'skip', '0', '7', 'NaN']) {
    const result = applyCommand(s, { type: 'choose', actor: 0, option }, catalog);
    assert.ok(result.error);
    assert.equal(result.state, s);
    assert.equal(s.players[0].exSkills.dice.uses, 1);
  }
  const rng = s.rng, after = choose(s, '6');
  assert.equal(after.players[0].exSkills.dice.uses, 0);
  assert.equal(after.effectRoll.value, 6);
  assert.equal(after.rng, rng);
  assert.equal(after.pending, null);
});

test('every available credit is used automatically; only exhausted credits return to a random die', () => {
  let s = waiting(2, 3);
  const rng = s.rng;
  s = choose(s, '4');
  assert.deepEqual(optionIds(s), faces);
  assert.equal(s.players[0].exSkills.dice.uses, 1);
  assert.equal(s.effectRoll.value, 4);
  assert.equal(s.rng, rng);
  s = choose(s, '2');
  assert.equal(s.pending, null);
  assert.equal(s.players[0].exSkills.dice.uses, 0);
  assert.notEqual(s.rng, rng);
  assert.ok(s.effectRoll.value >= 1 && s.effectRoll.value <= 6);
  assert.equal(waiting(0).pending, null);
});

test('old saved choices and room views drop the decline option; the server rejects a stale decline', () => {
  const old = legacy();
  assert.deepEqual(optionIds(restoreGame(old, catalog)), faces);
  for (const viewer of [0, 1, 'spectator']) assert.deepEqual(optionIds(viewFor(old, viewer)), faces);
  assert.ok(optionIds(old).includes('roll'), 'view/restore must not mutate the input');
  const decline = applyCommand(old, { type: 'choose', actor: 0, option: 'roll' }, catalog);
  assert.ok(decline.error);
  const after = choose(old, '3');
  assert.equal(after.players[0].exSkills.dice.uses, 0);
  assert.equal(after.effectRoll.value, 3);
  assert.deepEqual(legalMoves(old, 0, catalog).map(move => move.command.option), faces);
  assert.ok(faces.includes(cpuCommand(old, catalog, { side: 0 }).option));
});

test('a previously queued decline asks for a face instead of bypassing the automatic skill', () => {
  const s = arena();
  s.players[0].exSkills = { dice: { uses: 1 } };
  s.queue = [{ op: 'die', actor: 0, target: 'roll' }];
  const after = run(s, { type: 'adjust', actor: 0, resource: 'pp', delta: 0 }, true);
  assert.deepEqual(optionIds(after), faces);
  assert.equal(after.players[0].exSkills.dice.uses, 1);
  assert.equal(after.rng, s.rng);
});
