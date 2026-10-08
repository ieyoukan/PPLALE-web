import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosition, checkPosition, decodePosition, encodePosition, findLethal, playMatch, positionOf, restoreGame } from '../dist/index.js';
import { catalog, fromCode, run, stats } from './helpers.mjs';

const side = (extra = {}) => ({ playable: 'p_0', points: 12, maxPoints: 12, turns: 3, maxPp: 3, pp: 3, field: [], hand: [], nap: [], yojo: [], sweet: [], ...extra });
const position = (me = {}, foe = {}, extra = {}) => ({ version: 1, active: 0, first: 0, players: [side(me), side(foe)], ...extra });

test('position: builds a playing match with the cards, stats and resources it describes', () => {
  const s = buildPosition(position(
    { field: [{ id: 'y_1' }, null, { id: 'y_23', attack: 1, hp: 2, damage: 1, keywords: ['guard', 'charge'], fresh: true }], hand: ['y_8', { id: 's_6', cost: -1, revealed: true }], points: 7, maxPp: 6, pp: 4, skills: [1], yojo: ['y_9', 'y_4'] },
    { field: [{ id: 'y_17', acted: true, ate: true }], points: 3, turns: 2 },
  ), catalog);
  assert.equal(s.phase, 'playing');
  const [me, foe] = s.players;
  assert.deepEqual(me.field.map(uid => s.cards[uid].slot), [0, 2]);
  const ffura = s.cards[me.field[1]];
  assert.deepEqual(stats(s, ffura.uid), [4, 5]);
  assert.deepEqual(ffura.keywords, ['guard', 'charge']);
  assert.equal(ffura.entered, s.turn);
  assert.deepEqual(s.cards[me.field[0]].keywords, ['taunt']);
  assert.deepEqual([me.points, me.pp, me.turns + me.ppBonus, me.skills[0]], [7, 4, 6, 1]);
  assert.equal(s.cards[me.hand[1]].costDelta, -1);
  assert.deepEqual(me.yojo.map(uid => s.cards[uid].cardId), ['y_9', 'y_4']);
  // Thresholds already passed do not draw again.
  assert.deepEqual([me.milestones, foe.milestones], [[10], [10, 5]]);
  assert.equal(s.cards[foe.field[0]].ateOn, s.turn - 1);
  assert.equal(s.cards[foe.field[0]].exhausted, true);
});

test('position: survives saving and the round trip through positionOf and a share code', () => {
  const start = position({ field: [{ id: 'y_3', shield: true }], hand: ['y_9'], played: ['y_2'], sweetBoost: 1, shield: true }, { field: [null, { id: 'y_28' }], exile: ['s_9'] }, { title: 'テスト', first: 1 });
  const s = buildPosition(start, catalog);
  assert.ok(restoreGame(JSON.parse(JSON.stringify(s)), catalog));
  const back = positionOf(s, catalog);
  const { title, ...untitled } = start;
  assert.equal(title, 'テスト');
  assert.deepEqual(back, untitled);
  assert.deepEqual(decodePosition(`見てください ${encodePosition(start)} よろしく`), start);
  assert.deepEqual(positionOf(fromCode(encodePosition(start)), catalog), untitled);
  assert.equal(decodePosition('PPL1.壊れた'), null);
  assert.equal(decodePosition('関係ない文'), null);
});

test('position: a board taken from a real match plays on the same', () => {
  let states = [];
  playMatch(catalog, { levels: ['normal', 'normal'], seed: 3, onStep: s => { if (s.phase === 'playing' && !s.pending && !s.queue.length) states.push(s); } });
  for (const s of states.filter((_, i) => i % 7 === 0)) {
    const p = positionOf(s, catalog);
    assert.deepEqual(checkPosition(p, catalog), []);
    assert.deepEqual(positionOf(buildPosition(p, catalog), catalog), p);
  }
});

test('position: is played like any match (詰み: とここ + ストラ + さら take 9 points)', () => {
  let s = buildPosition(position({ field: [{ id: 'y_1' }], hand: ['y_25', 'y_19'], maxPp: 10, pp: 10, turns: 6 }, { points: 8 }), catalog);
  const lethal = findLethal(s, 0, catalog);
  assert.equal(lethal.status, 'win');
  for (const command of lethal.line) s = run(s, command);
  assert.equal(s.winner, 0);
  // ストラ 4 + とここ 1 + the ストラ さら summons again 4: one more point is out of reach.
  s = buildPosition(position({ field: [{ id: 'y_1' }], hand: ['y_25', 'y_19'], maxPp: 10, pp: 10, turns: 6 }, { points: 10 }), catalog);
  assert.equal(findLethal(s, 0, catalog).status, 'none');
});

test('position: explains what cannot be played', () => {
  const errors = checkPosition(position({ field: [{ id: 's_6' }, { id: 'y_9', damage: 2 }], points: 13, maxPp: 13, skills: [3] }, { playable: 'p_6', hand: ['nope'] }, { active: 1 }), catalog);
  for (const words of ['場：猫カフェオレは置けません', 'HPが0以下', 'お菓子が最大値を超えて', '最大PPは12まで', '残り回数は2回まで', '奥：通常プレイアブル', 'nope というカード']) {
    assert.ok(errors.some(e => e.includes(words)), `${words} in ${errors.join(' / ')}`);
  }
  assert.throws(() => buildPosition(position({ points: 13 }), catalog), /最大値/);
});
