import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneState } from '../dist/core/state.js';
import { applyCommand } from '../dist/index.js';
import { arena, catalog, choose, hand, play } from './helpers.mjs';

/** Every object / array reachable from a value. */
function objects(value, found = new Set()) {
  if (value === null || typeof value !== 'object' || found.has(value)) return found;
  found.add(value);
  for (const child of Object.values(value)) objects(child, found);
  return found;
}

test('cloneState copies every nested object (a new model field must be added to it)', () => {
  // A state that uses every optional part: dice, pending choice, queued steps with id lists.
  let s = arena({ me: { hand: ['y_26'] }, foe: { field: ['y_23', 'y_23', 'y_23'] } });
  s.dice = { rolls: [3, 5], ties: 1 };
  s = choose(play(s, hand(s)[0]), 'two');
  s.queue.push({ op: 'damage', actor: 0, ids: ['a'], candidates: ['b'] });
  const copy = cloneState(s);
  assert.deepEqual(copy, s);
  const shared = [...objects(copy)].filter(object => objects(s).has(object));
  assert.deepEqual(shared, [], 'the clone shares mutable objects with the original');
});

test('both sides reaching 0 sweet points in the same step is not a draw: the second player wins', () => {
  for (const firstPlayer of [0, 1]) {
    const s = arena();
    s.rules.firstPlayer = firstPlayer;
    s.players[0].points = 0;
    s.players[1].points = 0;
    const next = applyCommand(s, { type: 'adjust', actor: 0, resource: 'pp', delta: 0 }, catalog, true).state;
    assert.equal(next.winner, firstPlayer === 0 ? 1 : 0);
  }
});
