// ルームの独自ルール（先攻・後攻の固定、初期手札の枚数、後攻5ターン目の追加PP）とテンプレート。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPreset, describePlayRules, engineRules, maxPp, newGame, officialPlay, parsePlayRules, presetOf, restoreGame, sandboxRules } from '../dist/index.js';
import { parseRoomRules, describeRoomRules } from '../dist/room.js';
import { arena, catalog, draws, failure, hand, run } from './helpers.mjs';

const deck = { name: 'テスト', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19'), playable: 'p_0' };
const create = (rules, seed = 42) => newGame([deck, deck], catalog, rules, seed);
const end = s => run(s, { type: 'end', actor: s.active });
function deal(s) {
  while (s.phase === 'opening') s = run(s, { type: 'openingDraw', actor: s.openingRemaining[0] ? 0 : 1, deck: 'yojo' });
  while (s.phase === 'mulligan') s = run(s, { type: 'keep', actor: s.active });
  return s;
}

test('a fixed order skips the dice and the choice: the chosen seat goes first from the opening draws', () => {
  for (const seat of [0, 1]) {
    let s = create(engineRules({ firstSeat: seat }));
    assert.equal(s.phase, 'opening');
    assert.equal(s.dice, null);
    assert.equal(s.rules.firstPlayer, seat);
    assert.equal(s.active, seat);
    assert.deepEqual(s.openingRemaining, seat === 0 ? [3, 4] : [4, 3]);
    assert.ok(failure(s, { type: 'roll', actor: 0 }));
    assert.ok(failure(s, { type: 'initiative', actor: seat, order: 'second' }));
    s = deal(s);
    assert.equal(s.phase, 'playing');
    assert.equal(s.active, seat);
    assert.equal(s.players[seat].turns, 1);
    assert.equal(hand(s, seat).length, 3);
    assert.equal(hand(s, seat === 0 ? 1 : 0).length, 4);
  }
});

test('opening hand sizes follow the rules after the dice too, by order and not by seat', () => {
  let s = create(engineRules({ openingHand: [4, 3] }));
  assert.equal(s.phase, 'dice');
  while (s.phase === 'dice') s = run(s, { type: 'roll', actor: !s.dice || s.dice.rolls[0] === null || s.dice.rolls[1] !== null ? 0 : 1 });
  const chooser = s.active;
  s = run(s, { type: 'initiative', actor: chooser, order: 'second' });
  const first = chooser === 0 ? 1 : 0;
  assert.equal(s.openingRemaining[first], 4);
  assert.equal(s.openingRemaining[chooser], 3);
  s = deal(s);
  assert.equal(hand(s, first).length, 4);
  assert.equal(hand(s, chooser).length, 3);
});

test('the opening counts of a fixed order and a handicap are both kept by a save', () => {
  const s = create(engineRules({ firstSeat: 1, openingHand: [5, 2], secondBoost: false }));
  assert.deepEqual(s.openingRemaining, [2, 5]);
  const restored = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  assert.deepEqual(restored.rules, { ...sandboxRules, firstPlayer: 1, fixedOrder: true, openingHand: [5, 2], secondBoost: false });
  assert.deepEqual(restored, s);
  // Saves from before these rules restore with the official ones.
  const official = restoreGame(JSON.parse(JSON.stringify(create(sandboxRules))), catalog);
  assert.deepEqual(official.rules, sandboxRules);
});

test('without the turn-5 boost the 後攻 has only its usual PP on its fifth turn', () => {
  let s = arena({ me: { turns: 4, ppBonus: 0 }, foe: { turns: 4, ppBonus: 0 }, rules: { secondBoost: false } });
  s = draws(end(s));
  assert.equal(s.active, 1);
  assert.equal(s.players[1].turns, 5);
  assert.equal(s.players[1].turnPpBonus, 0);
  assert.equal(s.players[1].pp, 5);
  assert.equal(maxPp(s, 1), 5);
});

test('play rules keep only valid values and leave out what equals the official rule', () => {
  assert.deepEqual(parsePlayRules(null), {});
  assert.deepEqual(parsePlayRules({ firstSeat: 2, openingHand: [3, 4], secondBoost: true }), {});
  assert.deepEqual(parsePlayRules({ openingHand: [0, 4] }), {});
  assert.deepEqual(parsePlayRules({ openingHand: [10, 4] }), {});
  assert.deepEqual(parsePlayRules({ openingHand: [2.5, 4] }), {});
  assert.deepEqual(parsePlayRules({ firstSeat: 1, openingHand: [9, 1], secondBoost: false, extra: 1 }), { firstSeat: 1, openingHand: [9, 1], secondBoost: false });
  assert.ok(officialPlay({ openingHand: [3, 4] }));
  assert.ok(!officialPlay({ secondBoost: false }));
  assert.deepEqual(engineRules({}), sandboxRules);
  assert.equal(describePlayRules({}), '');
  assert.equal(describePlayRules({ firstSeat: 0, openingHand: [3, 3], secondBoost: false }), '先攻：席1 ／ 初期手札：先攻3枚・後攻3枚 ／ 後攻5ターン目+2PP：なし');
});

test('a room keeps its play rules with the rest of its rules', () => {
  const rules = parseRoomRules({ fruits: ['strawberry'], extendedPlayable: false, spectators: true, firstSeat: 0, openingHand: [4, 3], secondBoost: false });
  assert.deepEqual(rules, { fruits: ['strawberry'], extendedPlayable: false, spectators: true, firstSeat: 0, openingHand: [4, 3], secondBoost: false });
  assert.match(describeRoomRules(rules), /先攻：席1 ／ 初期手札：先攻4枚・後攻3枚 ／ 後攻5ターン目\+2PP：なし ／ 観戦：あり/);
  assert.doesNotMatch(describeRoomRules(parseRoomRules({ fruits: ['strawberry'] })), /先攻|初期手札/);
});

test('templates are recognised from the rules, whichever seat goes first, and keep the chosen seat', () => {
  assert.equal(presetOf({}), 'official');
  assert.equal(presetOf({ firstSeat: 1, secondBoost: false }), 'handicap1');
  assert.equal(presetOf({ firstSeat: 0, secondBoost: false, openingHand: [3, 3] }), 'handicap2');
  assert.equal(presetOf({ firstSeat: 1, secondBoost: false, openingHand: [4, 3] }), 'handicap3');
  assert.equal(presetOf({ firstSeat: 0 }), null);
  assert.equal(presetOf({ openingHand: [5, 5] }), null);
  assert.deepEqual(applyPreset({ firstSeat: 1 }, 'handicap2'), { firstSeat: 1, secondBoost: false, openingHand: [3, 3] });
  assert.deepEqual(applyPreset({}, 'handicap1'), { firstSeat: 0, secondBoost: false });
  assert.deepEqual(applyPreset({ firstSeat: 1, secondBoost: false }, 'official'), {});
});
