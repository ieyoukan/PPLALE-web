import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuCommand } from '../dist/ai/index.js';
import { arena, catalog, choose, field, hand, run } from './helpers.mjs';

const attackFromCpu = () => {
  const s = arena({ me: { hand: ['y_64'], pp: 0, points: 2 }, foe: { field: ['y_25'] } });
  s.active = 1; s.players[1].skills.fill(0);
  const command = cpuCommand(s, catalog, { side: 1, level: 'normal' });
  assert.equal(command.type, 'attack'); assert.equal(command.target, 'leader');
  return run(s, command);
};

test('a CPU attack waits for the human Wimaru reaction before points or victory change', () => {
  const s = attackFromCpu();
  assert.equal(s.pending.task.op, 'eatResponse'); assert.equal(s.pending.task.actor, 0);
  assert.equal(s.active, 1); assert.equal(s.players[0].points, 2); assert.equal(s.winner, null);
  assert.equal(cpuCommand(s, catalog, { side: 1, level: 'normal' }), null);
});

test('the human can use Wimaru on the CPU turn with zero PP, discard it and choose either deck', () => {
  let s = attackFromCpu(); const uid = hand(s)[0], attacker = field(s, 1)[0];
  s = choose(s, uid);
  assert.ok(s.players[0].nap.includes(uid)); assert.equal(s.cards[uid].revealed, true);
  assert.equal(s.players[0].pp, 0); assert.equal(s.players[0].points, 2); assert.equal(s.winner, null);
  assert.equal(s.cards[attacker].ateOn, s.turn); assert.equal(s.pending.task.actor, 0);
  for (const deck of ['yojo', 'sweet', 'yojo', 'sweet']) s = choose(s, deck);
  assert.equal(s.players[0].exile.length, 4); assert.equal(s.players[0].points, 2); assert.equal(s.pending, null);
});

test('declining Wimaru allows the pending lethal attack and leaves it concealed in hand', () => {
  let s = attackFromCpu(); const uid = hand(s)[0]; s = choose(s, 'skip');
  assert.equal(s.players[0].points, 0); assert.equal(s.winner, 1);
  assert.ok(hand(s).includes(uid)); assert.equal(s.cards[uid].revealed, false); assert.equal(s.players[0].nap.length, 0);
});
