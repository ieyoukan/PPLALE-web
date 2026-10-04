import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, cpuCommand, findLethal } from '../dist/index.js';
import { arena, catalog, field, hand } from './helpers.mjs';

/** Replays a line on the real state and returns the final state. */
function replay(s, line) {
  for (const command of line) {
    const result = applyCommand(s, command, catalog);
    assert.equal(result.error, undefined, JSON.stringify(command));
    s = result.state;
  }
  return s;
}

test('finds a direct lethal attack', () => {
  const s = arena({ me: { field: ['y_20'] }, foe: { points: 5 } });
  const result = findLethal(s, 0, catalog);
  assert.equal(result.status, 'win');
  assert.equal(replay(s, result.line).winner, 0);
});

test('finds a line that needs the right order: remove the guard first, then eat', () => {
  // ぷらむ kills ちょり (guard) so ふろんと can reach the sweets: 2 + 3 = 5 ≥ 4.
  const s = arena({ me: { field: ['y_20'], hand: ['y_9'] }, foe: { field: ['y_8'], points: 4 } });
  const result = findLethal(s, 0, catalog);
  assert.equal(result.status, 'win');
  assert.deepEqual(result.line.map(c => c.type), ['play', 'choose', 'attack']);
  assert.equal(replay(s, result.line).winner, 0);
});

test('reports none when every line was tried and nothing wins', () => {
  const s = arena({ me: { field: ['y_9'], hand: ['y_23'] } });
  const result = findLethal(s, 0, catalog);
  assert.equal(result.status, 'none');
  assert.ok(result.nodes > 1);
});

test('reports unknown instead of none when the budget runs out', () => {
  const s = arena({ me: { field: ['y_9', 'y_9', 'y_9'], hand: ['y_9', 'y_23', 'y_22', 's_15'] }, foe: { field: ['y_23', 'y_17'] } });
  assert.equal(findLethal(s, 0, catalog, { maxNodes: 5 }).status, 'unknown');
});

test('a line that only wins with lucky random damage is not lethal; a guaranteed hit is', () => {
  // あみの at max PP 8 deals 2 to a random enemy (no steal below 10). ふろんと needs the guard gone to
  // reach the sweets for 2 + 3 = 5; attacking the guard itself only eats 2.
  const board = foeField => arena({ me: { field: ['y_20'], hand: ['y_12'], ppBonus: 6 }, foe: { field: foeField, points: 5 } });
  const unlucky = board(['y_8', 'y_28']);
  unlucky.cards[field(unlucky, 1)[1]].keywords = [];
  assert.equal(findLethal(unlucky, 0, catalog).status, 'none', 'the random hit may miss the guard');
  const sure = board(['y_8']);
  const result = findLethal(sure, 0, catalog);
  assert.equal(result.status, 'win');
  assert.equal(replay(sure, result.line).winner, 0);
});

test('the さいきょう CPU plays the winning line step by step', () => {
  let s = arena({ me: { field: ['y_20'], hand: ['y_9', 'y_23'] }, foe: { field: ['y_8'], points: 4 } });
  for (let i = 0; i < 5 && s.winner === null; i++) s = replay(s, [cpuCommand(s, catalog, { level: 'master', side: 0 })]);
  assert.equal(s.winner, 0);
  assert.equal(hand(s).length, 1, 'it did not waste the turn on ふらら');
});

test('lethal continues through both mandatory opponent milestone draws', () => {
  const s = arena({ me: { field: ['y_25', 'y_25', 'y_25'], pp: 0 } });
  s.players[0].skills.fill(0);
  field(s).forEach(uid => { s.cards[uid].attackBonus = 1; });
  const before = structuredClone(s);
  const result = findLethal(s, 0, catalog, { maxNodes: 12 });
  assert.equal(result.status, 'win');
  assert.deepEqual(result.line.map(c => c.actor), [0, 1, 0, 1, 0]);
  assert.ok(result.line.filter(c => c.actor === 1).every(c => c.type === 'choose' && c.option === 'sweet'));
  assert.equal(replay(s, result.line).winner, 0);
  assert.deepEqual(s, before);
});

test('lethal prioritizes a guard-removing skill within a tight node budget', () => {
  const s = arena({ me: { playable: 'p_1', field: ['y_23'], pp: 0 }, foe: { field: ['y_8'], points: 3 } });
  const result = findLethal(s, 0, catalog, { maxNodes: 3 });
  assert.equal(result.status, 'win');
  assert.deepEqual(result.line.map(c => c.type), ['skill', 'choose', 'attack']);
  assert.equal(result.line[0].index, 1);
  assert.equal(replay(s, result.line).winner, 0);
});

test('lethal does not choose an optional opponent response', () => {
  const s = arena({ me: { field: ['y_25'] }, foe: { points: 3 } });
  s.pending = { task: { op: 'draw', actor: 1 }, prompt: 'draw', options: [
    { id: 'yojo', label: 'yojo' }, { id: 'sweet', label: 'sweet' },
  ] };
  const result = findLethal(s, 0, catalog);
  assert.equal(result.status, 'none');
  assert.deepEqual(result.line, []);
});

test('lethal still checks luck when a milestone draw resumes queued random damage', () => {
  const s = arena({ me: { field: ['y_20'], pp: 0 }, foe: { field: ['y_8', 'y_28'], points: 5 } });
  s.players[0].skills.fill(0);
  s.cards[field(s, 1)[1]].keywords = [];
  s.rng = 1; // This roll hits the guard, but other rolls may miss it.
  s.pending = { task: { op: 'draw', actor: 1, deck: 'sweet', text: 'threshold' }, prompt: 'draw',
    options: [{ id: 'sweet', label: 'sweet' }] };
  s.queue = [{ op: 'randomDamage', actor: 0, amount: 2 }];
  assert.equal(findLethal(s, 0, catalog).status, 'none');
});

test('lethal detects a win from effects resumed after an opponent milestone draw', () => {
  const s = arena({ me: { pp: 0 }, foe: { points: 3 } });
  s.pending = { task: { op: 'draw', actor: 1, deck: 'sweet', text: 'threshold' }, prompt: 'draw',
    options: [{ id: 'sweet', label: 'sweet' }] };
  s.queue = [{ op: 'reduce', actor: 0, amount: 3 }];
  const result = findLethal(s, 0, catalog);
  assert.equal(result.status, 'win');
  assert.equal(replay(s, result.line).winner, 0);
});

test('master replans after each opponent milestone draw to finish the winning turn', () => {
  let s = arena({ me: { field: ['y_25', 'y_25', 'y_25'], pp: 0 } });
  s.players[0].skills.fill(0);
  field(s).forEach(uid => { s.cards[uid].attackBonus = 1; });
  for (let step = 0; step < 5 && s.winner === null; step++) {
    const side = s.pending?.task.actor ?? s.active;
    s = replay(s, [cpuCommand(s, catalog, { level: 'master', side })]);
  }
  assert.equal(s.winner, 0);
});
