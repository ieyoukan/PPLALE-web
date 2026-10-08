import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosition, checkPosition, editGame, positionOf } from '../dist/index.js';
import { catalog, field, hand, idsOf, stats } from './helpers.mjs';

const side = (extra = {}) => ({ playable: 'p_0', points: 12, maxPoints: 12, turns: 3, maxPp: 3, pp: 3, field: [], hand: [], nap: [], yojo: [], sweet: [], ...extra });
const board = (me = {}, foe = {}) => buildPosition({ version: 1, active: 0, first: 0, players: [side(me), side(foe)] }, catalog);
const edit = (s, ...edits) => edits.reduce((state, e) => editGame(state, e, catalog), s);

test('edit: cards go where they are put, and only where they may go', () => {
  let s = edit(board(), { type: 'add', side: 0, zone: 'field', cardId: 'y_1', slot: 3 }, { type: 'add', side: 1, zone: 'hand', cardId: 's_6' },
    { type: 'add', side: 0, zone: 'yojo', cardId: 'y_9' }, { type: 'add', side: 0, zone: 'yojo', cardId: 'y_4', top: true });
  assert.equal(s.cards[field(s)[0]].slot, 3);
  assert.deepEqual(s.cards[field(s)[0]].keywords, ['taunt']);
  assert.deepEqual(idsOf(s, hand(s, 1)), ['s_6']);
  assert.deepEqual(idsOf(s, s.players[0].yojo), ['y_4', 'y_9']);
  assert.throws(() => edit(s, { type: 'add', side: 0, zone: 'field', cardId: 'y_9', slot: 3 }), /置けません/);
  assert.throws(() => edit(s, { type: 'add', side: 0, zone: 'field', cardId: 's_6', slot: 0 }), /置けません/);
  assert.throws(() => edit(s, { type: 'add', side: 0, zone: 'sweet', cardId: 'y_9' }), /置けません/);
  const deck = s.players[0].yojo;
  s = edit(s, { type: 'toTop', uid: deck[1] }, { type: 'remove', uid: hand(s, 1)[0] });
  assert.deepEqual(idsOf(s, s.players[0].yojo), ['y_9', 'y_4']);
  assert.equal(hand(s, 1).length, 0);
});

test('edit: a unit can be changed, moved and sent back to the hand', () => {
  let s = edit(board(), { type: 'add', side: 0, zone: 'field', cardId: 'y_23', slot: 0 });
  const uid = field(s)[0];
  s = edit(s, { type: 'unit', uid, attack: 2, hp: 1, damage: 9, keywords: ['charge'], fresh: true, acted: true, ate: true });
  // Damage is capped so the unit keeps 1 HP.
  assert.deepEqual(stats(s, uid), [5, 1]);
  assert.deepEqual(s.cards[uid].keywords, ['charge']);
  assert.deepEqual([s.cards[uid].entered, s.cards[uid].exhausted, s.cards[uid].ateOn], [s.turn, true, s.turn - 1]);
  s = edit(s, { type: 'move', uid, slot: 6 });
  assert.equal(s.cards[uid].slot, 6);
  s = edit(s, { type: 'toHand', uid });
  assert.deepEqual([field(s).length, idsOf(s, hand(s))], [0, ['y_23']]);
  assert.deepEqual(stats(s, hand(s)[0]), [3, 4]);
  // And onto the field again, as one edit: no cost, no on-play effect.
  const back = hand(s)[0];
  s = edit(s, { type: 'toField', uid: back, slot: 2 });
  assert.deepEqual([hand(s).length, field(s), s.cards[back].slot, s.players[0].pp], [0, [back], 2, 3]);
  const withSweet = edit(s, { type: 'add', side: 0, zone: 'hand', cardId: 's_6' });
  assert.throws(() => edit(withSweet, { type: 'toField', uid: hand(withSweet)[0], slot: 0 }), /置けません/);
});

test('edit: players and the turn; the result plays as a position', () => {
  let s = edit(board(), { type: 'player', side: 1, playable: 'p_3', points: 15, maxPoints: 9, turns: 5, ppBonus: 9, pp: 20, skills: [1, 0] },
    { type: 'played', side: 1, cardIds: ['y_2', 'y_2'] }, { type: 'turn', active: 1, first: 1 });
  const p = s.players[1];
  // Points stay within the maximum, max PP within 12, unnamed skills keep their uses.
  assert.deepEqual([p.points, p.maxPoints, p.turns, p.ppBonus, p.pp], [9, 9, 5, 7, 12]);
  assert.deepEqual(p.skills, [1, 0, 1, 1]);
  assert.deepEqual(p.milestones, [10]);
  assert.deepEqual([s.active, s.rules.firstPlayer], [1, 1]);
  const position = positionOf(s, catalog);
  assert.deepEqual(checkPosition(position, catalog), []);
  assert.deepEqual(positionOf(buildPosition(position, catalog), catalog), position);
});
