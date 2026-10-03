import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreGame } from '../dist/index.js';
import { arena, catalog, choose, draws, field, hand, play } from './helpers.mjs';

/** Rewrites a current state into the shape the previous engine saved. */
function legacy(s) {
  const old = JSON.parse(JSON.stringify(s));
  Object.assign(old.rules, { guardBlocksUnits: false, pierceIgnoresTaunt: false });
  for (const p of old.players) {
    p.doubleSweet = p.sweetBoost > 0;
    delete p.sweetBoost;
  }
  return old;
}

test('older saves restore: boolean 呪文, legacy rule fields', () => {
  const s = arena();
  s.players[0].sweetBoost = 1;
  const restored = restoreGame(legacy(s), catalog);
  assert.equal(restored.players[0].sweetBoost, 1);
  assert.equal(restored.players[1].sweetBoost, 0);
  assert.equal('doubleSweet' in restored.players[0], false);
  assert.equal('guardBlocksUnits' in restored.rules, false);
});

test("older saves restore a waiting 'discardThen' as discard plus the card's follow-ups", () => {
  let s = arena({ me: { hand: ['y_27', 'y_9'], points: 5 } });
  s = play(s, hand(s)[0]);
  const old = legacy(s);
  // The previous engine queued one combined step for オフティ二.
  old.pending.task = { op: 'discardThen', actor: 0, source: field(s)[0], text: 'oftini', multiplier: 1 };
  old.queue = old.queue.filter(t => t.op === 'enterAuras');
  s = restoreGame(old, catalog);
  assert.equal(s.pending.task.op, 'discard');
  s = draws(choose(s, hand(s)[0]));
  assert.equal(s.players[0].points, 7);
  assert.equal(hand(s).length, 2);
});

test('unknown steps are rejected instead of crashing later', () => {
  const s = legacy(arena());
  s.queue.push({ op: 'teleport', actor: 0 });
  assert.equal(restoreGame(s, catalog), null);
});
