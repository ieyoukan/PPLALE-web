// ダブルプレイアブル：2枚目のプレイアブルを控えに置き、自分のターン中にコストなしで切り替える。
// 共通スキルの回数は2枚で共有し、控えのパッシブも発動する（2026-11-22 ユーザー指定）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckRuleErrors, engineRules, legalMoves, newGame, parseMatchRules, playableView, restoreGame, sandboxRules, skillLimits, skillPrice, validateDeck } from '../dist/index.js';
import { arena, catalog, choose, failure, field, newest, playFirst, run, skill } from './helpers.mjs';

const deck = { name: 'テスト', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19'), playable: 'p_0', subPlayable: 'p_1' };
/** Puts `playable` in reserve for `side`, with all its uses. */
function withReserve(s, side, playable) {
  const p = s.players[side];
  p.reserve = { playable, skills: skillLimits({ ...p, reserve: { playable } }, catalog, playable) };
  return s;
}
const swap = s => run(s, { type: 'switchPlayable', actor: s.active });

test('a match puts the second playable in reserve only where the rules allow two', () => {
  const double = newGame([deck, deck], catalog, engineRules({ doublePlayable: true }), 1);
  assert.equal(double.rules.doublePlayable, true);
  for (const p of double.players) {
    assert.equal(p.playable, 'p_0');
    assert.deepEqual(p.reserve, { playable: 'p_1', skills: skillLimits({ playable: 'p_1', played: [] }, catalog) });
  }
  const single = newGame([deck, deck], catalog, sandboxRules, 1);
  assert.equal(single.players[0].reserve, undefined);
  assert.deepEqual(validateDeck({ ...deck, subPlayable: 'p_0' }, catalog), ['2枚目には別のプレイアブルを選んでください']);
  assert.deepEqual(validateDeck({ ...deck, subPlayable: 'y_2' }, catalog), ['2枚目に使えるプレイアブルを選んでください']);
});

test('switching is free on one\'s own turn, keeps each playable\'s uses and shares the common skill', () => {
  let s = withReserve(arena({ me: { playable: 'p_1', field: ['y_17'] }, foe: { field: ['y_17', 'y_17'] } }), 0, 'p_0');
  s = choose(skill(s, 0), field(s)[0]);
  s = choose(skill(s, 1), field(s, 1)[0]);
  assert.deepEqual(s.players[0].skills.slice(0, 2), [1, 1]);
  const { pp } = s.players[0], acted = s.stall?.acted;
  s = swap(s);
  const p = s.players[0];
  assert.equal(p.playable, 'p_0');
  assert.equal(p.reserve.playable, 'p_1');
  assert.equal(p.skills[0], 1, 'the common skill keeps its one use left');
  assert.equal(p.skills[1], skillLimits({ playable: 'p_0', played: [] }, catalog)[1], 'あみの has all its own uses');
  assert.equal(p.reserve.skills[1], 1, 'うぃまる keeps what it used');
  assert.equal(p.pp, pp, 'switching costs nothing');
  assert.equal(s.stall?.acted, acted, 'switching is not an action for the stall rule');
  assert.match(s.log.at(-1), /プレイアブルをあみのに切り替え/);
  // Twice more in the same turn: back and forth as often as wanted.
  s = swap(swap(s));
  assert.equal(s.players[0].playable, 'p_0');
  s = skill(s, 1);
  assert.equal(s.players[0].skills[1], 0);
  s = swap(s);
  assert.deepEqual([s.players[0].playable, s.players[0].skills[0], s.players[0].skills[1], s.players[0].reserve.skills[1]], ['p_1', 1, 1, 0]);
  // The common skill's last use is shared: used from うぃまる, あみの has none left either.
  s = choose(skill(s, 0), field(s)[0]);
  s = swap(s);
  assert.equal(s.players[0].skills[0], 0);
  assert.match(failure(s, { type: 'skill', actor: 0, index: 0 }), /残り回数/);
  // Not on the opponent's turn, and not without a second playable.
  s = run(s, { type: 'end', actor: 0 });
  while (s.pending) s = choose(s, s.pending.options[0].id);
  assert.equal(s.active, 1);
  assert.ok(failure(s, { type: 'switchPlayable', actor: 0 }));
  assert.match(failure(s, { type: 'switchPlayable', actor: 1 }), /控えのプレイアブル/);
});

test('a passive works from the reserve: ちょり in reserve gives おにごっこ to every unit that enters', () => {
  let s = withReserve(arena({ me: { playable: 'p_0', hand: ['y_17'] } }), 0, 'p_8');
  s = playFirst(s, 'y_17');
  assert.deepEqual([s.cards[newest(s)].keywords.includes('evade'), s.cards[newest(s)].evasion], [true, 6]);
  assert.deepEqual(playableView(s, 0, catalog).reserve.passive, { name: 'えへへー、みんなであそぼー！', active: true });
});

test('いのまこ in reserve adds its use to the shared common skill but makes only its own 固有スキル free', () => {
  let s = withReserve(arena({ me: { playable: 'p_1', hand: ['y_16', 'y_15'] } }), 0, 'p_7');
  s = playFirst(playFirst(s, 'y_16'), 'y_15');
  const p = s.players[0];
  assert.equal(p.skills[0], 3, 'the common skill has one more use');
  assert.equal(skillPrice(p, 2, catalog).pp, 1, 'うぃまる\'s own skill keeps its printed cost (provisional reading)');
  assert.deepEqual(playableView(s, 0, catalog).reserve.skills.map(entry => entry.left), [3, 1, 1]);
  s = swap(s);
  assert.deepEqual([1, 2].map(index => skillPrice(s.players[0], index, catalog).pp), [0, 0]);
  assert.equal(s.players[0].skills[0], 3);
});

test('a saved match keeps the reserve and the rule', () => {
  const opening = newGame([deck, deck], catalog, engineRules({ doublePlayable: true, firstSeat: 0 }), 3);
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(opening)), catalog), opening);
  const s = swap(withReserve(arena({ me: { playable: 'p_1' } }), 0, 'p_0'));
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(s)), catalog), s);
  assert.equal(restoreGame(JSON.parse(JSON.stringify({ ...s, players: [{ ...s.players[0], reserve: { playable: 'nope', skills: [] } }, s.players[1]] })), catalog), null);
});

test('deck rules: the second playable counts only where two are allowed', () => {
  const rules = { fruits: ['strawberry'], extendedPlayable: false };
  const exp = { ...deck, subPlayable: 'p_6' };
  assert.deepEqual(deckRuleErrors(exp, rules, catalog), [], 'one playable only: the second stays out of the match');
  assert.match(deckRuleErrors(exp, { ...rules, doublePlayable: true }, catalog).join(), /拡張プレイアブル/);
  assert.deepEqual(deckRuleErrors(exp, { ...rules, extendedPlayable: true, doublePlayable: true }, catalog), []);
  assert.deepEqual(deckRuleErrors({ ...deck, subPlayable: 'p_0' }, rules, catalog), []);
  assert.ok(deckRuleErrors({ ...deck, subPlayable: 'p_0' }, { ...rules, doublePlayable: true }, catalog).length);
  assert.equal(parseMatchRules({ ...rules, doublePlayable: true }).doublePlayable, true);
  assert.equal(parseMatchRules({ ...rules, doublePlayable: 'yes' }).doublePlayable, undefined);
});

test('the CPU may switch once a turn, and only when the reserve has a skill it can pay for', () => {
  let s = withReserve(arena({ me: { playable: 'p_0', pp: 0 }, foe: { field: ['y_17'] } }), 0, 'p_1');
  const switches = state => legalMoves(state, 0, catalog).filter(move => move.command.type === 'switchPlayable').length;
  assert.equal(switches(s), 1, 'うぃまる\'s first skill costs 0');
  s = swap(s);
  assert.equal(switches(s), 0, 'already switched this turn');
  s = withReserve(arena({ me: { playable: 'p_1', pp: 1 } }), 0, 'p_0');
  assert.equal(switches(s), 0, 'あみの\'s skills cost 3 and 2');
});
