import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneState } from '../dist/core/state.js';
import { arena, choose, hand, play } from './helpers.mjs';

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
