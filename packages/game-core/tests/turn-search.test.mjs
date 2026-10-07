import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuCommand, legalMoves } from '../dist/index.js';
import { createMaster, searchTurn } from '../dist/ai/index.js';
import { pointless } from '../dist/ai/moves.js';
import { drawValue, evaluatePlan } from '../dist/ai/planning.js';
import { arena, catalog, field, hand, run } from './helpers.mjs';

const emptyDecks = s => {
  for (const p of s.players) { p.yojo = []; p.sweet = []; }
  return s;
};
const command = s => cpuCommand(s, catalog, { side: 0, level: 'master' });

test('master: plays inomoo before makoponi to fit both into 5 PP', () => {
  let s = emptyDecks(arena({ me: { hand: ['y_15', 'y_16'], pp: 5 } }));
  const first = command(s);
  assert.equal(first.type, 'play');
  assert.equal(s.cards[first.uid].cardId, 'y_16');
  s = run(s, first);
  const next = command(s);
  assert.equal(next.type, 'play');
  assert.equal(s.cards[next.uid].cardId, 'y_15');
  s = run(s, next);
  assert.equal(s.players[0].pp, 0);
  assert.equal(field(s).length, 2);
});

test('master: borrows PP to complete a combo, but not when it cannot unlock a play', () => {
  let s = emptyDecks(arena({ me: { playable: 'p_2', hand: ['y_15', 'y_16'], pp: 3 } }));
  for (let i = 0; i < 8 && field(s).length < 2; i++) s = run(s, command(s));
  assert.deepEqual(field(s).map(uid => s.cards[uid].cardId).sort(), ['y_15', 'y_16']);
  assert.equal(s.players[0].nextPpDebt, 2);
  const stuck = emptyDecks(arena({ me: { playable: 'p_2', hand: ['y_25'], pp: 0 } }));
  assert.equal(command(stuck).type, 'end');
});

test('master: prepares a doubled cake before attacking', () => {
  const s = emptyDecks(arena({ me: { field: ['y_3'], hand: ['s_25', 's_16'], pp: 5 } }));
  const first = command(s);
  assert.equal(first.type, 'play');
  assert.equal(s.cards[first.uid].cardId, 's_25');
});

test('master: trades instead of feeding a revealed rikus counterattack', () => {
  const s = emptyDecks(arena({ me: { field: ['y_25'], pp: 0 }, foe: { field: ['y_3'], hand: ['y_24'] } }));
  s.cards[hand(s, 1)[0]].revealed = true;
  const next = command(s);
  assert.equal(next.type, 'attack');
  assert.equal(next.target, field(s, 1)[0]);
});

test('planning: evaluation is symmetric and draw value ignores deck order', () => {
  const s = arena({ me: { hand: ['y_15'], field: ['y_16'] }, foe: { field: ['y_3'] } });
  assert.ok(Math.abs(evaluatePlan(s, 0, catalog) + evaluatePlan(s, 1, catalog)) < 1e-9);
  const before = drawValue(s, 0, 'yojo', catalog);
  s.players[0].yojo.reverse();
  assert.ok(Math.abs(drawValue(s, 0, 'yojo', catalog) - before) < 1e-9);
});

test('turn search: respects a small node budget, returns a legal move and leaves the state intact', () => {
  const s = arena({ me: { field: ['y_3', 'y_15'], hand: ['y_16', 's_16'], pp: 5 }, foe: { field: ['y_17'] } });
  const original = structuredClone(s), moves = legalMoves(s, 0, catalog);
  const fallback = moves.find(move => move.command.type === 'end');
  const result = searchTurn({ state: s, side: 0, catalog, moves, random: () => 0 }, fallback,
    { maxNodes: 100, worlds: 8, candidates: 12 });
  assert.ok(result.nodes <= 100);
  assert.ok(moves.includes(result.move));
  assert.deepEqual(s, original);
  assert.equal(createMaster({ maxNodes: 100 }).level, 'master');
});

/** さいきょう plays side 0 until its turn ends; returns the commands. */
function playTurn(s) {
  const sent = [];
  while (s.winner === null && s.active === 0 && sent.length < 30) {
    const next = command(s);
    sent.push(next);
    s = run(s, next);
  }
  return { s, sent };
}
const fresh = (s, uid) => { s.cards[uid].entered = s.turn; return s; };

test('charge: giving it is pointless unless a unit that just entered can then attack a unit', () => {
  const skill = { type: 'skill', actor: 0, index: 0 };
  const useless = (s, command) => pointless(s, { command, next: s });
  let s = arena({ me: { field: ['y_10'] }, foe: { field: ['y_9'] } });
  assert.equal(useless(s, skill), true, 'the unit could attack anyway');
  s = fresh(s, field(s)[0]);
  assert.equal(useless(s, skill), false);
  s = arena({ me: { field: ['y_10'] } });
  s = fresh(s, field(s)[0]);
  assert.equal(useless(s, skill), true, 'charge cannot reach the sweets');
  // Choosing the target: an old or exhausted unit is pointless while a fresh one can take it.
  s = arena({ me: { field: ['y_10', 'y_3'] }, foe: { field: ['y_9'] } });
  const [young, old] = field(s);
  s = run(fresh(s, young), skill);
  assert.equal(useless(s, { type: 'choose', actor: 0, option: old }), true);
  assert.equal(useless(s, { type: 'choose', actor: 0, option: young }), false);
});

test('master: gives charge to attack with it, never just to spend the skill', () => {
  // The opponent has no skills left, so the trade is plainly good: ぷらむ dies, ゼロオレンジ survives.
  let s = emptyDecks(arena({ me: { field: ['y_10'], pp: 0 }, foe: { field: ['y_9'] } }));
  s.players[1].skills = s.players[1].skills.map(() => 0);
  s = fresh(s, field(s)[0]);
  let { s: after, sent } = playTurn(s);
  assert.ok(sent.some(c => c.type === 'skill'), 'uses the charge skill');
  assert.ok(sent.some(c => c.type === 'attack'), 'and attacks with it');
  assert.deepEqual(field(after, 1), []);
  // Nothing to attack: the skill stays unused.
  s = emptyDecks(arena({ me: { field: ['y_10'], pp: 0 } }));
  ({ s: after, sent } = playTurn(fresh(s, field(s)[0])));
  assert.ok(!sent.some(c => c.type === 'skill'));
  assert.equal(after.players[0].skills[0], s.players[0].skills[0]);
});
