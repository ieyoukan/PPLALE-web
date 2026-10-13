// 拡張プレイアブル (ExP): p_6 しゅれい (MP), p_7 いのまこ (a passive that makes skills free and adds a use),
// p_8 ちょり (おにごっこ for every unit that enters, a reaction skill on the opponent's turn, 行動不能 for a time).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availablePpMaximum, buildPosition, canAttack, changesBetween, checkPosition, cpuCommand, decodePosition, deckRuleErrors, editGame, encodePosition,
  legalMoves, mpMax, playableNow, playableView, playMatch, positionOf, randomStrawberryDeck, restoreGame, skillLimit, skillPrice, skillsFor, validateDeck, viewFor,
} from '../dist/index.js';
import { cloneState } from '../dist/core/state.js';
import { pointless } from '../dist/ai/moves.js';
import { arena, catalog, choose, draws, failure, field, hand, idsOf, newest, optionIds, playFirst, run, skill, stats } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });
const nextTurn = s => draws(end(s));
const attack = (s, uid = field(s, s.active)[0], target = field(s, s.active === 0 ? 1 : 0)[0]) => run(s, { type: 'attack', actor: s.active, uid, target });
/** Why the active side cannot use skill `index` now (undefined when it can). */
const refused = (s, index) => failure(s, { type: 'skill', actor: s.active, index });
/** Saved and loaded again, as a room server or the browser storage does. */
const reloaded = s => restoreGame(JSON.parse(JSON.stringify(s)), catalog);
const plain = s => JSON.parse(JSON.stringify(s));
/** おにごっこ(1d6≧x) on a unit that was put on the board by the test (it did not enter the field). */
function giveEvade(s, uid, x = 6) {
  s.cards[uid].keywords.push('evade');
  s.cards[uid].evasion = x;
}

// ── Decks and rules ──

test('拡張プレイアブル lead a deck, and a match decides whether they are allowed', () => {
  assert.equal(playableNow.extendedPlayable, true);
  for (const playable of ['p_6', 'p_7', 'p_8']) {
    const deck = { ...randomStrawberryDeck(3), playable };
    assert.deepEqual(validateDeck(deck, catalog), []);
    assert.deepEqual(deckRuleErrors(deck, { fruits: ['strawberry'], extendedPlayable: true }, catalog), []);
    assert.match(deckRuleErrors(deck, { fruits: ['strawberry'], extendedPlayable: false }, catalog)[0], /拡張プレイアブル/);
  }
});

// ── p_6 しゅれい ──

test('p_6 しゅれい: starts with 3 MP; ルナレストア costs 1 PP for 2 MP, has no use limit, and MP stops at 20', () => {
  let s = arena({ me: { playable: 'p_6' } });
  assert.equal(s.players[0].mp, 3);
  assert.equal(s.players[1].mp, undefined, 'a playable without MP has none');
  assert.deepEqual(s.players[0].skills, [2, 0, 0, 0, 0, 0]);
  s = skill(s, 1);
  assert.deepEqual([s.players[0].mp, s.players[0].pp], [5, 9]);
  for (let i = 0; i < 9; i++) s = skill(s, 1);
  // 3 + 2 × 10 would be 23.
  assert.deepEqual([s.players[0].mp, s.players[0].pp], [20, 0]);
  assert.match(refused(s, 1), /PP/);
  // Its uses are not counted, but the history of skills used is kept.
  assert.equal(s.players[0].skills[1], 0);
  assert.equal(s.players[0].skillHistory.length, 10);
  assert.equal(skillLimit(s.players[0], 1, catalog), 0);
  assert.equal(playableView(s, 0, catalog).skills[1].left, null);
});

test('p_6 しゅれい: MP skills cost MP instead of PP and are refused without enough MP', () => {
  let s = arena({ me: { playable: 'p_6' }, foe: { field: ['y_23', 'y_9'] } });
  const [fura, plum] = field(s, 1);
  for (const index of [2, 3, 4, 5]) assert.match(refused(s, index), /MPが足りません/);
  s.players[0].mp = 20;
  // アイシクルレイン: 5 MP, 1 damage to every enemy unit.
  s = skill(s, 2);
  assert.deepEqual([s.cards[fura].damage, s.cards[plum].damage], [1, 1]);
  assert.deepEqual([s.players[0].mp, s.players[0].pp], [15, 10]);
  // アブソリュートゼロ: 9 MP, destroys the chosen enemy unit.
  s = choose(skill(s, 3), fura);
  assert.ok(s.players[1].nap.includes(fura));
  assert.equal(s.players[0].mp, 6);
  assert.match(refused(s, 4), /MPが足りません/);
  // フロストバーンベール: 9 MP, -3/-3 (a unit left without HP is destroyed).
  s.players[0].mp = 9;
  s = choose(skill(s, 4), plum);
  assert.ok(s.players[1].nap.includes(plum));
  assert.deepEqual([s.players[0].mp, s.players[0].pp], [0, 10]);
  // Nobody left to select: the targeted skills cannot be used, and nothing is paid for trying.
  s.players[0].mp = 20;
  for (const index of [3, 4]) assert.match(refused(s, index), /幼女がいません/);
  assert.equal(s.players[0].mp, 20);
});

test('p_6 しゅれい: 効果耐性 stops アブソリュートゼロ but not -3/-3; アストラルフレア destroys both fields', () => {
  let s = arena({ me: { playable: 'p_6', field: ['y_9', 'y_23'] }, foe: { field: ['y_17', 'y_28'] } });
  const jonko = field(s, 1)[1];
  s.players[0].mp = 20;
  // じょんこ has 挑発: a skill that selects must select it.
  s = skill(s, 3);
  assert.deepEqual(optionIds(s), [jonko]);
  s = choose(s, jonko);
  assert.ok(field(s, 1).includes(jonko));
  s = choose(skill(s, 4), jonko);
  assert.deepEqual(stats(s, jonko), [2, 2]);
  assert.equal(s.players[0].mp, 2);
  s.players[0].mp = 15;
  s = skill(s, 5);
  assert.deepEqual([field(s), field(s, 1)], [[], [jonko]]);
  assert.equal(s.players[0].mp, 0);
});

test('p_6 しゅれい: skills without a limit do not keep ぶどうのもなか from acting, and あみの resets only the counted ones', () => {
  let s = arena({ me: { playable: 'p_6', field: ['y_50', 'y_9'], hand: ['y_55'] }, foe: { field: ['y_17'] } });
  const [monaka, plum] = field(s), target = field(s, 1)[0];
  assert.equal(canAttack(s, 0, monaka, target, catalog), false);
  s = choose(skill(s, 0), plum);
  s = choose(skill(s, 0), plum);
  assert.equal(canAttack(s, 0, monaka, target, catalog), true);
  s = playFirst(s, 'y_55');
  assert.deepEqual(s.players[0].skills, [2, 0, 0, 0, 0, 0]);
});

// ── p_7 いのまこ ──

test('p_7 いのまこ: つまみ食い gives 早食い and じゃんがりあーん gives 貫通, once each for 1 PP', () => {
  let s = arena({ me: { playable: 'p_7', hand: ['y_23'] } });
  for (const index of [1, 2]) assert.match(refused(s, index), /場にいません/);
  s = playFirst(s, 'y_23');
  const unit = newest(s);
  assert.equal(canAttack(s, 0, unit, 'leader', catalog), false);
  s = choose(skill(s, 1), unit);
  assert.ok(s.cards[unit].keywords.includes('fast'));
  assert.equal(canAttack(s, 0, unit, 'leader', catalog), true);
  assert.equal(s.players[0].pp, 10 - 4 - 1);
  assert.match(refused(s, 1), /残り回数/);

  s = arena({ me: { playable: 'p_7', field: ['y_20'] }, foe: { field: ['y_23'] } });
  assert.equal(canAttack(s, 0, field(s)[0], 'leader', catalog), false, '防衛 protects the sweets');
  s = choose(skill(s, 2), field(s)[0]);
  assert.ok(s.cards[field(s)[0]].keywords.includes('pierce'));
  assert.equal(canAttack(s, 0, field(s)[0], 'leader', catalog), true);
  assert.equal(s.players[0].pp, 9);
  assert.match(refused(s, 2), /残り回数/);
});

test('p_7 いのまこ: once いのむー and まこぽに were both played, its own skills cost 0 and the common skill has one more use', () => {
  let s = arena({ me: { playable: 'p_7', hand: ['y_16', 'y_15'] } });
  const costs = () => [0, 1, 2].map(index => skillPrice(s.players[0], index, catalog).pp);
  assert.deepEqual(costs(), [0, 1, 1]);
  s = playFirst(s, 'y_16');
  // One of the two is not enough.
  assert.deepEqual([costs(), s.players[0].skills, playableView(s, 0, catalog).passive], [[0, 1, 1], [2, 1, 1], { name: 'いのまこコンビネーション', active: false }]);
  s = playFirst(s, 'y_15');
  assert.deepEqual([costs(), s.players[0].skills, playableView(s, 0, catalog).passive.active], [[0, 0, 0], [3, 1, 1], true]);
  assert.equal(skillLimit(s.players[0], 0, catalog), 3);
  const pp = s.players[0].pp;
  s = choose(skill(s, 1), field(s)[0]);
  s = choose(skill(s, 2), field(s)[0]);
  assert.equal(s.players[0].pp, pp, 'both cost nothing now');
  for (let i = 0; i < 3; i++) s = choose(skill(s, 0), field(s)[0]);
  assert.match(refused(s, 0), /残り回数/);
  assert.deepEqual(s.players[0].skills, [0, 0, 0]);
});

test('p_7 いのまこ: the extra use is also given after the common skill was used up, and only plays from hand count', () => {
  let s = arena({ me: { playable: 'p_7', hand: ['y_44', 'y_15'], field: ['y_17'] } });
  const unit = field(s)[0];
  s = choose(skill(s, 0), unit);
  s = choose(skill(s, 0), unit);
  assert.equal(s.players[0].skills[0], 0);
  // ぶどうのいのむー and いちごのまこぽに: the names count, whatever the fruit.
  s = playFirst(s, 'y_44');
  s = playFirst(s, 'y_15');
  assert.deepEqual(s.players[0].skills, [1, 1, 1]);
  assert.equal(skillPrice(s.players[0], 1, catalog).pp, 0);

  // On the field without having been played from hand (put there by the test; a copy by さら is the same).
  s = arena({ me: { playable: 'p_7', field: ['y_16', 'y_15'] } });
  assert.equal(playableView(s, 0, catalog).passive.active, false);
  assert.equal(skillPrice(s.players[0], 1, catalog).pp, 1);
  // The opponent's plays are not the owner's.
  s.players[1].played = ['y_16', 'y_15'];
  assert.equal(playableView(s, 0, catalog).passive.active, false);
});

test('p_7 いのまこ: ぶどうのあみの resets the common skill to its raised limit', () => {
  let s = arena({ me: { playable: 'p_7', hand: ['y_16', 'y_15', 'y_55'], field: ['y_17'] } });
  s = playFirst(playFirst(s, 'y_16'), 'y_15');
  for (let i = 0; i < 3; i++) s = choose(skill(s, 0), field(s)[0]);
  s = choose(skill(s, 1), field(s)[0]);
  assert.deepEqual(s.players[0].skills, [0, 0, 1]);
  s = playFirst(s, 'y_55');
  assert.deepEqual(s.players[0].skills, [3, 1, 1]);
});

// ── p_8 ちょり: the passive ──

test('p_8 ちょり: every unit that enters its field gets おにごっこ(1d6≧6) — played, copied or summoned', () => {
  let s = arena({ me: { playable: 'p_8', hand: ['y_19', 's_21'], field: ['y_17'] }, foe: { hand: ['y_17'] } });
  const old = field(s)[0];
  assert.ok(!s.cards[old].keywords.includes('evade'), 'put on the board by the test, it never entered');
  s = choose(playFirst(s, 'y_19'), old);
  s = playFirst(s, 's_21');
  // さら herself, the まめろん she copied, and the ギガプリン a sweet summoned.
  assert.deepEqual(idsOf(s, field(s)), ['y_19', 'y_17', 'token_pudding']);
  for (const uid of field(s)) assert.deepEqual([s.cards[uid].keywords.includes('evade'), s.cards[uid].evasion], [true, 6], s.cards[uid].cardId);
  // The opponent's units do not get it.
  s = nextTurn(s);
  s = playFirst(s, 'y_17');
  assert.ok(!s.cards[newest(s, 1)].keywords.includes('evade'));
});

test('p_8 ちょり: a unit that already has おにごっこ(1d6≧X) gets X−1, again each time it enters', () => {
  let s = arena({ me: { playable: 'p_8', hand: ['y_49', 'y_32'] } });
  s = playFirst(s, 'y_49');
  const furonto = newest(s);
  assert.equal(s.cards[furonto].evasion, 4);
  // Back in hand it is the printed card (≧5); played again it is ≧4, not ≧3.
  s = choose(playFirst(s, 'y_32'), furonto);
  assert.ok(hand(s).includes(furonto));
  assert.deepEqual([s.cards[furonto].keywords, s.cards[furonto].evasion], [['evade'], 5]);
  s = run(s, { type: 'play', actor: 0, uid: furonto });
  assert.equal(s.cards[furonto].evasion, 4);
});

test('p_8 ちょり: what the passive gave is lost when the unit leaves the field', () => {
  let s = arena({ me: { playable: 'p_8', hand: ['y_17'] } });
  s = playFirst(s, 'y_17');
  const unit = newest(s);
  s = run(s, { type: 'adjust', actor: 0, resource: 'damage', delta: 9, uid: unit }, true);
  assert.ok(s.players[0].nap.includes(unit));
  assert.deepEqual([s.cards[unit].keywords, s.cards[unit].evasion], [['guard', 'noEat'], undefined]);
});

// ── p_8 ちょり: きんきゅーかいひー！ ──

/** Side 0 attacks a ふらら of the ちょり player (side 1) that has おにごっこ(1d6≧6). */
function attacked(attacker = 'y_20', extra = {}) {
  const s = arena({ me: { field: [attacker] }, foe: { playable: 'p_8', field: ['y_23'], ...extra } });
  giveEvade(s, field(s, 1)[0]);
  return s;
}

test('p_8 ちょり: きんきゅーかいひー！ is offered when an own おにごっこ unit is attacked; the roll counts as 6', () => {
  let s = attacked();
  const [attacker] = field(s), [target] = field(s, 1);
  s = attack(s);
  assert.deepEqual([s.pending.task.op, s.pending.task.actor, optionIds(s)], ['skillReaction', 1, ['skip', '1']]);
  const before = s;
  s = choose(s, '1');
  // The attack is avoided: no damage either way, no 攻撃時 effect (ふろんとさん eats 2), the attacker has acted.
  assert.deepEqual([s.cards[attacker].damage, s.cards[target].damage, s.players[1].points, s.cards[attacker].exhausted], [0, 0, 12, true]);
  assert.equal(s.pending, null);
  assert.ok(!changesBetween(before, s).some(change => change.kind === 'roll'), 'no die is rolled');
  assert.deepEqual([s.players[1].skills[1], s.players[1].nextPpDebt, s.players[1].skillHistory], [0, 2, [1]]);
  // The next own turn has 2 PP less.
  s = nextTurn(s);
  assert.equal(s.active, 1);
  assert.equal(s.players[1].pp, availablePpMaximum(s, 1) - 2);
  assert.equal(s.players[1].nextPpDebt, 0);
});

test('p_8 ちょり: declining きんきゅーかいひー！ rolls the die as usual and keeps the skill', () => {
  let s = attacked('y_17');
  s.players[1].exSkills = { dice: { uses: 1 } };
  const [attacker] = field(s), [target] = field(s, 1);
  s = choose(attack(s), 'skip');
  // レンテのExスキル still chooses the value of the die that is rolled now.
  assert.equal(s.pending.task.op, 'die');
  s = choose(s, '5');
  assert.deepEqual([s.cards[attacker].damage, s.cards[target].damage], [3, 3]);
  assert.deepEqual([s.players[1].skills[1], s.players[1].nextPpDebt], [1, 0]);
});

test('p_8 ちょり: きんきゅーかいひー！ is used once, only for おにごっこ units, and never on its own turn', () => {
  let s = arena({ me: { field: ['y_17', 'y_17'] }, foe: { playable: 'p_8', field: ['y_23', 'y_17'] } });
  const [first, second] = field(s), [evading, plainUnit] = field(s, 1);
  giveEvade(s, evading);
  // A unit without おにごっこ: nothing is asked.
  s = attack(s, first, plainUnit);
  assert.equal(s.pending, null);
  assert.equal(s.cards[plainUnit].damage, 3);
  s = choose(attack(s, second, evading), '1');
  assert.equal(s.cards[evading].damage, 0);
  // Used up: the next attack goes straight to the roll.
  s = nextTurn(nextTurn(s));
  s = attack(s, first, evading);
  assert.equal(s.pending, null);
  assert.equal(s.players[1].skills[1], 0);

  s = arena({ me: { playable: 'p_8', field: ['y_17'] }, foe: { field: ['y_17'] } });
  giveEvade(s, field(s)[0]);
  assert.match(refused(s, 1), /相手ターン中/);
  assert.equal(playableView(s, 0, catalog).skills[1].reaction, true);
  assert.ok(!legalMoves(s, 0, catalog).some(move => move.command.type === 'skill' && move.command.index === 1));
});

test('p_8 ちょり: ぶどうのとここ hides when the reaction skill is used, like for any skill', () => {
  let s = attacked('y_17', { field: ['y_23', 'y_34'] });
  const tokoko = field(s, 1)[1];
  s.cards[tokoko].hiding = false;
  s = choose(attack(s), '1');
  assert.equal(s.cards[tokoko].hiding, true);
});

test('p_8 ちょり: the question about the reaction skill is public, and the attacker cannot answer it', () => {
  const s = attack(attacked());
  assert.match(failure(s, { type: 'choose', actor: 0, option: '1' }), /選択/);
  // Unlike a reaction from the hand, nothing hidden is behind it.
  const seen = viewFor(s, 0).pending;
  assert.deepEqual(seen.options.map(option => option.id), ['skip', '1']);
  assert.equal(seen.prompt, s.pending.prompt);
});

// ── p_8 ちょり: ちょりちゅけにむちゅーになれー！ ──

test('p_8 ちょり: an enemy unit is 行動不能 until the end of the next opponent turn', () => {
  let s = arena({ me: { playable: 'p_8' }, foe: { field: ['y_20'] } });
  const target = field(s, 1)[0];
  assert.match(refused(arena({ me: { playable: 'p_8' } }), 2), /幼女がいません/);
  const before = skill(s, 2);
  s = choose(before, target);
  assert.deepEqual([s.cards[target].immobileUntil, s.players[0].pp, s.players[0].skills[2]], [s.turn + 1, 9, 0]);
  assert.deepEqual(changesBetween(before, s).find(change => change.kind === 'keywords'), { kind: 'keywords', uid: target, added: ['immobile'], removed: [] });
  // The opponent's next turn: it cannot attack.
  s = nextTurn(s);
  assert.equal(s.active, 1);
  assert.equal(canAttack(s, 1, target, 'leader', catalog), false);
  assert.ok(failure(s, { type: 'attack', actor: 1, uid: target, target: 'leader' }));
  // It ends with that turn.
  s = nextTurn(s);
  assert.equal(s.cards[target].immobileUntil, undefined);
  s = nextTurn(s);
  assert.equal(canAttack(s, 1, target, 'leader', catalog), true);
});

test('p_8 ちょり: 行動不能 is lost when the unit leaves the field, and おにごっこ can avoid the skill', () => {
  let s = arena({ me: { playable: 'p_8', hand: ['y_9'] }, foe: { field: ['y_9'] } });
  let target = field(s, 1)[0];
  s = choose(skill(s, 2), target);
  assert.equal(s.cards[target].immobileUntil, s.turn + 1);
  // いちごのぷらむ: 2 damage destroys it.
  s = choose(playFirst(s, 'y_9'), target);
  assert.ok(s.players[1].nap.includes(target));
  assert.equal(s.cards[target].immobileUntil, undefined);

  s = arena({ me: { playable: 'p_8' }, foe: { field: ['y_49'] } });
  s.players[1].exSkills = { dice: { uses: 1 } };
  target = field(s, 1)[0];
  s = choose(choose(skill(s, 2), target), '6');
  assert.equal(s.cards[target].immobileUntil, undefined);
  assert.equal(s.players[0].skills[2], 0, 'the skill is spent all the same');
});

// ── Saving, copying, the board editor ──

test('拡張プレイアブル: a match is saved and restored in the middle of a reaction, with MP and 行動不能', () => {
  let s = arena({ me: { playable: 'p_6', field: ['y_20'] }, foe: { playable: 'p_8', field: ['y_23'] } });
  giveEvade(s, field(s, 1)[0]);
  s = skill(s, 1);
  s.cards[field(s)[0]].immobileUntil = s.turn + 1;
  let restored = reloaded(s);
  assert.deepEqual(plain(restored), plain(s));
  assert.deepEqual([restored.players[0].mp, restored.cards[field(s)[0]].immobileUntil], [5, s.turn + 1]);
  // Waiting for the answer to the reaction skill.
  delete s.cards[field(s)[0]].immobileUntil;
  s = attack(s);
  restored = reloaded(s);
  assert.deepEqual(plain(restored), plain(s));
  assert.deepEqual(plain(choose(restored, '1')), plain(choose(s, '1')));
  assert.equal(choose(restored, '1').players[1].nextPpDebt, 2);
  // And a copy shares nothing with the original.
  const copy = cloneState(s);
  assert.deepEqual(plain(copy), plain(s));
  copy.players[0].mp = 0;
  copy.pending.task.resume.step = 'changed';
  assert.deepEqual([s.players[0].mp, s.pending.task.resume.step], [5, 'answered']);
});

test('拡張プレイアブル: a position carries MP and 行動不能, and explains what is wrong with them', () => {
  const s = arena({ me: { playable: 'p_6' }, foe: { playable: 'p_8', field: ['y_20'] } });
  // What it starts with is not written out.
  assert.equal(positionOf(s, catalog).players[0].mp, undefined);
  s.players[0].mp = 11;
  s.cards[field(s, 1)[0]].immobileUntil = s.turn + 1;
  const position = positionOf(s, catalog);
  assert.equal(position.players[0].mp, 11);
  assert.deepEqual(position.players[1].cardTraits, [{ zone: 'field', index: 0, immobile: 1 }]);
  assert.deepEqual(checkPosition(position, catalog), []);
  const built = buildPosition(position, catalog);
  assert.deepEqual([built.players[0].mp, built.cards[built.players[1].field[0]].immobileUntil, built.players[0].skills], [11, built.turn + 1, [2, 0, 0, 0, 0, 0]]);
  assert.deepEqual(positionOf(built, catalog), position);
  assert.deepEqual(decodePosition(encodePosition(position)), position);
  assert.ok(reloaded(built));

  const side = (extra = {}) => ({ playable: 'p_0', points: 12, maxPoints: 12, turns: 3, maxPp: 3, pp: 3, field: [], hand: [], nap: [], yojo: [], sweet: [], ...extra });
  const errors = (me, foe = {}) => checkPosition({ version: 1, active: 0, first: 0, players: [side(me), side(foe)] }, catalog).join(' / ');
  assert.match(errors({ playable: 'p_6', mp: 21 }), /MPは20まで/);
  assert.match(errors({ mp: 3 }), /MPはありません/);
  assert.match(errors({ playable: 'p_6', skills: [2, 1] }), /制限はありません/);
  // The common skill may have 3 uses left only once the passive holds.
  assert.match(errors({ playable: 'p_7', skills: [3, 1, 1] }), /2回まで/);
  assert.equal(errors({ playable: 'p_7', skills: [3, 1, 1], played: ['y_16', 'y_45'] }), '');
  // Unused skills of a board that says nothing about them: the raised limit when the passive holds.
  const fresh = buildPosition({ version: 1, active: 0, first: 0, players: [side({ playable: 'p_7', played: ['y_16', 'y_15'] }), side({ playable: 'p_6' })] }, catalog);
  assert.deepEqual([fresh.players[0].skills, fresh.players[1].mp], [[3, 1, 1], 3]);
  assert.equal(positionOf(fresh, catalog).players[0].skills, undefined);
});

test('拡張プレイアブル: the board editor chooses them and edits MP, the history of plays and 行動不能', () => {
  const side = (extra = {}) => ({ playable: 'p_0', points: 12, maxPoints: 12, turns: 3, maxPp: 3, pp: 3, field: [], hand: [], nap: [], yojo: [], sweet: [], ...extra });
  const edit = (state, change) => editGame(state, change, catalog);
  let s = buildPosition({ version: 1, active: 0, first: 0, players: [side(), side({ field: [{ id: 'y_20' }] })] }, catalog);
  // MP comes and goes with the playable.
  assert.equal(edit(s, { type: 'player', side: 0, mp: 5 }).players[0].mp, undefined);
  s = edit(s, { type: 'player', side: 0, playable: 'p_6' });
  assert.deepEqual([s.players[0].mp, s.players[0].skills], [3, [2, 0, 0, 0, 0, 0]]);
  assert.equal(edit(s, { type: 'player', side: 0, mp: 99 }).players[0].mp, 20);
  assert.equal(edit(s, { type: 'player', side: 0, mp: -4 }).players[0].mp, 0);
  // A skill without a use limit has nothing to set.
  assert.deepEqual(edit(s, { type: 'player', side: 0, skills: [1, 5, 5, 5, 5, 5] }).players[0].skills, [1, 0, 0, 0, 0, 0]);
  s = edit(s, { type: 'player', side: 0, playable: 'p_7' });
  assert.deepEqual([s.players[0].mp, s.players[0].skills], [undefined, [2, 1, 1]]);
  // The passive follows the plays written into the history, as in a match.
  s = edit(s, { type: 'played', side: 0, cardIds: ['y_16', 'y_15'] });
  assert.deepEqual(s.players[0].skills, [3, 1, 1]);
  assert.deepEqual(edit(s, { type: 'player', side: 0, skills: [9, 1, 1] }).players[0].skills, [3, 1, 1]);
  s = edit(s, { type: 'played', side: 0, cardIds: ['y_16'] });
  assert.deepEqual(s.players[0].skills, [2, 1, 1]);

  const unit = s.players[1].field[0];
  s = edit(s, { type: 'unit', uid: unit, immobileTurns: 2 });
  assert.equal(s.cards[unit].immobileUntil, s.turn + 1);
  assert.deepEqual(positionOf(s, catalog).players[1].cardTraits, [{ zone: 'field', index: 0, immobile: 1 }]);
  s = edit(s, { type: 'unit', uid: unit, immobileTurns: 0 });
  assert.equal(s.cards[unit].immobileUntil, undefined);
  assert.deepEqual(checkPosition(positionOf(s, catalog), catalog), []);
});

// ── CPU ──

test('拡張プレイアブル: legal moves include MP skills only when they can be paid, and the answers to a reaction', () => {
  let s = arena({ me: { playable: 'p_6', pp: 0 }, foe: { field: ['y_17'] } });
  const skills = state => legalMoves(state, 0, catalog).flatMap(move => move.command.type === 'skill' ? [move.command.index] : []);
  // 3 MP and no PP: nothing can be paid (the common skill needs an own unit).
  assert.deepEqual(skills(s), []);
  s.players[0].mp = 9;
  assert.deepEqual(skills(s), [2, 3, 4]);
  s.players[0].pp = 1;
  s.players[0].mp = 20;
  assert.deepEqual(skills(s), [1, 2, 3, 4, 5]);
  // At 20 MP ルナレストア would only spend its PP: the search leaves it out.
  const luna = legalMoves(s, 0, catalog).find(move => move.command.type === 'skill' && move.command.index === 1);
  assert.equal(pointless(s, luna, catalog), true);
  s.players[0].mp = 18;
  assert.equal(pointless(s, luna, catalog), false);

  s = attack(attacked());
  assert.deepEqual(legalMoves(s, 1, catalog).map(move => move.command), [{ type: 'choose', actor: 1, option: 'skip' }, { type: 'choose', actor: 1, option: '1' }]);
  assert.deepEqual(legalMoves(s, 0, catalog), []);
});

test('拡張プレイアブル: the CPU turns spare PP into MP and spends MP on a unit worth it', () => {
  // Small decks: with none at all, destroying the last unit would end the match on points at once
  // (しゅれい's skills without a limit do not keep it going), which is a different question.
  const emptyDecks = s => { for (const p of s.players) { p.yojo = p.yojo.slice(0, 3); p.sweet = []; } return s; };
  for (const level of ['normal', 'hard', 'master']) {
    let s = emptyDecks(arena({ me: { playable: 'p_6', pp: 2 } }));
    assert.deepEqual(cpuCommand(s, catalog, { side: 0, level }), { type: 'skill', actor: 0, index: 1 }, `${level}: ルナレストア`);
    // Nothing to gain at the maximum.
    s.players[0].mp = 20;
    assert.equal(cpuCommand(s, catalog, { side: 0, level }).type, 'end', `${level}: MP is full`);
    // 9 MP for いろは: a 3/5 with 挑発 that no effect protects.
    s = emptyDecks(arena({ me: { playable: 'p_6', pp: 0 }, foe: { field: ['y_29'] } }));
    s.players[0].mp = 9;
    const command = cpuCommand(s, catalog, { side: 0, level });
    assert.deepEqual([command.type, command.index], ['skill', 3], `${level}: アブソリュートゼロ`);
  }
});

test('拡張プレイアブル: the CPU keeps きんきゅーかいひー！ for an attack that would destroy a unit worth it', () => {
  for (const level of ['normal', 'hard', 'master']) {
    // じょんこ (5) into ふらら (HP 4): she would be lost.
    let s = attack(attacked('y_28'));
    assert.deepEqual(cpuCommand(s, catalog, { side: 1, level }), { type: 'choose', actor: 1, option: '1' }, level);
    // ぷらむ (1) into ふらら: nothing to save.
    s = attack(attacked('y_9'));
    assert.deepEqual(cpuCommand(s, catalog, { side: 1, level }), { type: 'choose', actor: 1, option: 'skip' }, level);
  }
});

test('拡張プレイアブル: the CPU uses いのまこ and ちょり skills when they help', () => {
  // A unit that just entered could eat the last sweets with 早食い.
  let s = arena({ me: { playable: 'p_7', hand: ['y_23'], pp: 5 }, foe: { points: 3 } });
  s.players[0].yojo = []; s.players[0].sweet = [];
  s = playFirst(s, 'y_23');
  const first = cpuCommand(s, catalog, { side: 0, level: 'normal' });
  assert.deepEqual(first, { type: 'skill', actor: 0, index: 1 });
  s = run(s, first);
  assert.deepEqual(cpuCommand(s, catalog, { side: 0, level: 'normal' }), { type: 'choose', actor: 0, option: newest(s) });
  // 防衛 in the way and an attacker ready: 貫通.
  s = arena({ me: { playable: 'p_7', field: ['y_20'], pp: 1 }, foe: { field: ['y_17'] } });
  assert.deepEqual(cpuCommand(s, catalog, { side: 0, level: 'normal' }), { type: 'skill', actor: 0, index: 2 });
  // The strongest attacker is kept from acting.
  s = arena({ me: { playable: 'p_8', pp: 1 }, foe: { field: ['y_9', 'y_29'] } });
  const stun = cpuCommand(s, catalog, { side: 0, level: 'normal' });
  assert.deepEqual(stun, { type: 'skill', actor: 0, index: 2 });
  s = run(s, stun);
  assert.deepEqual(cpuCommand(s, catalog, { side: 0, level: 'normal' }), { type: 'choose', actor: 0, option: field(s, 1)[1] });
});

// ── Self-play ──

/** A deck that gives the playable something to do: いのむー / まこぽに for いのまこ, おにごっこ units for ちょり. */
function deckFor(playable, seed) {
  const deck = { ...randomStrawberryDeck(seed), playable, name: `${playable}-${seed}` };
  const with_ = cards => [...cards, ...deck.yojo.slice(cards.length)];
  if (playable === 'p_7') deck.yojo = with_(['y_16', 'y_16', 'y_16', 'y_15', 'y_15', 'y_15']);
  if (playable === 'p_8') deck.yojo = with_(['y_49', 'y_49', 'y_43', 'y_34']);
  return deck;
}

test('拡張プレイアブル: CPU matches with decks led by p_6 / p_7 / p_8 finish, within their limits', () => {
  const used = {}, count = key => { used[key] = (used[key] ?? 0) + 1; };
  const pairs = [['p_6', 'p_7'], ['p_7', 'p_8'], ['p_8', 'p_6'], ['p_6', 'p_6'], ['p_8', 'p_8'], ['p_7', 'p_0']];
  const levels = [['easy', 'normal'], ['normal', 'hard'], ['hard', 'normal'], ['hard', 'hard'], ['normal', 'normal'], ['master', 'easy']];
  let seed = 0;
  for (const [a, b] of pairs) for (const pair of levels) {
    seed++;
    // さいきょう searches every turn: one match per pair of playables is enough for it.
    if (pair[0] === 'master' && a === b) continue;
    const result = playMatch(catalog, {
      levels: pair, seed, decks: [deckFor(a, seed), deckFor(b, seed + 100)],
      onStep(s, command, side) {
        const where = `seed ${seed} ${a} vs ${b} turn ${s.turn} before ${JSON.stringify(command)}`;
        s.players.forEach((p, index) => {
          skillsFor(p.playable).forEach((_, i) => assert.ok(p.skills[i] >= 0 && p.skills[i] <= skillLimit(p, i, catalog), `${where}: skill ${i} of ${p.playable} has ${p.skills[i]}`));
          assert.ok((p.mp ?? 0) >= 0 && (p.mp ?? 0) <= mpMax(p.playable), `${where}: MP ${p.mp}`);
          assert.equal(p.mp === undefined, p.playable !== 'p_6', `${where}: MP of ${p.playable}`);
          // Every unit of a ちょり player entered its field, so it has おにごっこ; nobody else's units are kept from acting for longer than a turn ahead.
          if (p.playable === 'p_8') for (const uid of p.field) assert.ok(s.cards[uid].keywords.includes('evade') && s.cards[uid].evasion <= 6, `${where}: ${s.cards[uid].cardId}`);
          for (const uid of p.field) assert.ok((s.cards[uid].immobileUntil ?? s.turn) >= s.turn && (s.cards[uid].immobileUntil ?? s.turn) <= s.turn + 1, `${where}: 行動不能 ${s.cards[uid].immobileUntil}`);
          for (const zone of ['hand', 'nap', 'exile', 'yojo', 'sweet']) for (const uid of p[zone]) assert.equal(s.cards[uid].immobileUntil, undefined, `${where}: ${index}.${zone}`);
        });
        const playable = s.players[side].playable;
        if (command.type === 'skill') count(`${playable}:${command.index}`);
        if (command.type === 'choose' && s.pending.task.op === 'skillReaction' && command.option !== 'skip') count(`${playable}:reaction`);
      },
    });
    assert.notEqual(result.winner, null, `seed ${seed} ${a} vs ${b} (${pair}) did not finish`);
  }
  // The CPUs do use what is new: MP both ways, the free skills, the reaction and the 行動不能.
  for (const key of ['p_6:1', 'p_6:3', 'p_7:1', 'p_7:2', 'p_8:reaction', 'p_8:2']) assert.ok(used[key] > 0, `${key} was never used: ${JSON.stringify(used)}`);
});
