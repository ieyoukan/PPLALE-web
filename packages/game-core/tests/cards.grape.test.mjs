import test from 'node:test';
import assert from 'node:assert/strict';
import { canAttack, costOf, restoreGame } from '../dist/index.js';
import { arena, catalog, choose, draws, field, hand, idsOf, newest, optionIds, playFirst, run, skill, stats } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });
const attack = (s, target = field(s, 1)[0]) => run(s, { type: 'attack', actor: 0, uid: field(s)[0], target });

test('y_31 ほーずき: two revealed レンス count as grape and strawberry', () => {
  let s = playFirst(arena({ me: { hand: ['y_31', 'y_60', 'y_60'] } }), 'y_31');
  for (const uid of [...hand(s)]) s = choose(s, uid);
  s = choose(s, 'done');
  assert.deepEqual(stats(s, field(s)[0]), [2, 2]);
  s = draws(s);
  assert.equal(hand(s).length, 3);
});
test('y_32 ぷらむ: empty field does nothing; with an ally it returns the ally before damaging', () => {
  let s = playFirst(arena({ me: { hand: ['y_32'] } }), 'y_32');
  assert.deepEqual(stats(s, field(s)[0]), [1, 1]);
  s = arena({ me: { hand: ['y_32'], field: ['y_49'] }, foe: { field: ['y_8'] } });
  const ally = field(s)[0]; s = choose(playFirst(s, 'y_32'), ally);
  assert.ok(hand(s).includes(ally)); assert.deepEqual(field(s), []);
  assert.equal(field(s, 1).length, 0);
});
test('y_33 リンネ: two hand reactions follow the attacker swap; returning to hand resets cost', () => {
  let s = arena({ me: { field: ['y_49'] }, foe: { field: ['y_8'], hand: ['y_33', 'y_33'] } });
  const attacker = field(s)[0], defender = field(s, 1)[0], linnes = [...hand(s, 1)];
  s = attack(s, defender);
  assert.deepEqual(stats(s, attacker), [5, 1]);
  s = choose(s, linnes[0]); s = choose(s, linnes[1]);
  assert.equal(s.cards[attacker].attackBonus, 2);
  assert.ok(linnes.every(uid => s.cards[uid].revealed && costOf(s, uid, catalog, 1) === 2));
  s = arena({ me: { field: ['y_33'], hand: ['y_32'] } });
  const linne = field(s)[0]; s.cards[linne].costDelta = 3;
  s = choose(playFirst(s, 'y_32'), linne);
  assert.equal(costOf(s, linne, catalog, 0), 1);
});
test('y_33 リンネ: start-of-turn penalty uses the current hand cost', () => {
  let s = arena({ foe: { hand: ['y_33'] } });
  s.cards[hand(s, 1)[0]].costDelta = 3;
  s = draws(end(s)); assert.equal(s.players[1].points, 8);
});
test('y_34 とここ: skills on either side reactivate hiding until its next own turn', () => {
  let s = arena({ me: { field: ['y_34'] } }); const uid = field(s)[0];
  s = choose(skill(s, 0), uid); assert.equal(s.cards[uid].hiding, true);
  s = draws(end(s)); assert.equal(s.cards[uid].hiding, true);
  s = draws(end(s)); assert.equal(s.cards[uid].hiding, false);
  s = choose(skill(s, 0), uid); assert.equal(s.cards[uid].hiding, true);
});
test('y_35 えーりん: optional attack payment happens before combat', () => {
  let s = arena({ me: { field: ['y_35'] }, foe: { field: ['y_8'] } }); const uid = field(s)[0];
  s = draws(choose(attack(s), 'yes'));
  assert.equal(s.players[0].points, 10); assert.equal(s.cards[uid].attackBonus, 2); assert.equal(s.cards[uid].hpBonus, 1);
});
test('y_36 ふらら: ten nap units strengthen the buff, destruction adds a cat to nap', () => {
  let s = arena({ me: { hand: ['y_36'], field: ['y_8'], nap: Array(10).fill('y_9') } }); const ally = field(s)[0];
  s = choose(playFirst(s, 'y_36'), ally); assert.deepEqual(stats(s, ally), [4, 4]);
  const uid = newest(s); s = run(s, { type: 'adjust', actor: 0, resource: 'damage', delta: 9, uid }, true);
  assert.ok(idsOf(s, s.players[0].nap).includes('token_cat'));
});
test('y_37 がと: five nap units buff/draw; ten also grant fast', () => {
  for (const n of [4, 5, 10]) {
    let s = playFirst(arena({ me: { hand: ['y_37'], nap: Array(n).fill('y_9') } }), 'y_37');
    assert.deepEqual(stats(s, newest(s)), n < 5 ? [2, 2] : [3, 3]);
    assert.equal(s.cards[newest(s)].keywords.includes('fast'), n >= 10);
    s = draws(s); assert.equal(hand(s).length, n < 5 ? 0 : 1);
  }
});
test('y_38 氷花: inspecting/discarding deck top does not trigger hand discard effects', () => {
  let s = arena({ me: { hand: ['y_38'], yojo: ['y_5', 'y_9'] } }); const top = s.players[0].yojo[0];
  s = draws(choose(playFirst(s, 'y_38'), 'nap'));
  assert.ok(s.players[0].nap.includes(top)); assert.equal(hand(s).length, 1); assert.equal(s.cards[hand(s)[0]].cardId, 'y_9');
});
test('y_39 かがり: revealed grape units determine random damage and bonus draw', () => {
  let s = arena({ me: { hand: ['y_39', 'y_31', 'y_31', 'y_31'] }, foe: { field: ['y_8'] } });
  s = playFirst(s, 'y_39'); for (const uid of [...hand(s)]) s = choose(s, uid); s = choose(s, 'done');
  assert.equal(field(s, 1).length, 0); s = draws(s); assert.equal(hand(s).length, 4);
});
test('y_40 りくす: removes scripts/keywords on both sides without changing attack or HP', () => {
  let s = arena({ me: { hand: ['y_40'], field: ['y_20'] }, foe: { field: ['y_7', 'y_28'] } });
  const uid = field(s)[0], before = stats(s, uid); s = playFirst(s, 'y_40');
  assert.deepEqual(stats(s, uid), before); assert.ok(s.players.flatMap(p => p.field).every(uid => s.cards[uid].silenced && !s.cards[uid].keywords.length));
  s = draws(attack(s)); assert.equal(field(s, 1).length, 1); assert.equal(s.players[1].points, 12);
});
test('y_41 さら: zero/one/two nap cards copy only the cards originally present', () => {
  for (const n of [0, 1, 2]) {
    let s = playFirst(arena({ me: { hand: ['y_41'], nap: Array(n).fill('y_9') } }), 'y_41');
    let picks = 0; while (s.pending) { s = choose(s, optionIds(s)[0]); picks++; }
    assert.equal(picks, n); assert.equal(s.players[0].nap.length, n * 2);
  }
});
test('y_42 うゆち: HP0 still resolves its play effect, optional 3PP raises the revive limit', () => {
  let s = playFirst(arena({ me: { hand: ['y_42'], nap: ['y_62'] } }), 'y_42');
  assert.equal(field(s).length, 0); assert.ok(idsOf(s, s.players[0].nap).includes('y_42'));
  s = choose(s, 'yes'); s = choose(s, s.players[0].nap.find(uid => s.cards[uid].cardId === 'y_62')); s = draws(s);
  assert.equal(s.players[0].pp, 5); assert.deepEqual(idsOf(s, field(s)), ['y_62']); assert.equal(s.cards[field(s)[0]].hiding, true);
});
test('y_43 ちょり: extra PP changes the dodge condition; evade does not stack', () => {
  let s = arena({ me: { hand: ['y_43'], field: ['y_8'] } }); const uid = field(s)[0];
  s = choose(playFirst(s, 'y_43'), '3'); s = choose(s, uid);
  assert.equal(s.cards[uid].evasion, 2); assert.equal(s.players[0].pp, 4);
});
for (const [id, searched] of [['y_44', 'y_9'], ['y_45', 'y_31']]) test(`${id}: random fruit search returns a revealed card`, () => {
  const s = playFirst(arena({ me: { hand: [id], yojo: [searched] } }), id);
  assert.ok(hand(s).some(uid => s.cards[uid].revealed && (id === 'y_44' ? catalog[s.cards[uid].cardId].fruit === 'strawberry' : s.cards[uid].cardId === searched)));
});
test('y_46 ももか: removes a cost2+ nap card and reveals it in hand', () => {
  let s = arena({ me: { hand: ['y_46'], nap: ['y_31', 'y_37'] } }); const uid = s.players[0].nap[1];
  s = playFirst(s, 'y_46'); assert.deepEqual(optionIds(s), [uid]); s = choose(s, uid);
  assert.ok(hand(s).includes(uid)); assert.equal(s.cards[uid].revealed, true); assert.ok(!s.players[0].nap.includes(uid));
});
test('y_46 ももか: a destroyed unit recovered to hand returns with its printed stats', () => {
  let s = arena({ me: { hand: ['y_46'], field: ['y_37'], pp: 12 } }); const uid = field(s)[0];
  s.cards[uid].attackBonus = 3; s.cards[uid].fruitTypes = ['strawberry'];
  s = run(s, { type: 'adjust', actor: 0, uid, resource: 'damage', delta: 20 }, true);
  s = choose(playFirst(s, 'y_46'), uid); s = playFirst(s, 'y_37');
  assert.ok(field(s).includes(uid)); assert.deepEqual(stats(s, uid), [2, 2]); assert.deepEqual(s.cards[uid].fruitTypes, ['strawberry']);
});
test('y_47 ゆうひ: hand limit is checked before its end draw; HP5 permits action', () => {
  let s = arena({ me: { field: ['y_47'], hand: Array(9).fill('y_9') } }); const uid = field(s)[0];
  assert.equal(canAttack(s, 0, uid, 'leader', catalog), false);
  s = end(s); s = choose(s, 'yojo'); assert.equal(hand(s).length, 10); assert.equal(s.players[0].exile.length, 0); assert.equal(stats(s, uid)[1], 5);
  s = draws(s); s = draws(end(s)); assert.equal(canAttack(s, 0, uid, 'leader', catalog), true);
});
test('y_48 ゼロオレンジ: optional self damage destroys it, revealed レンス replaces the die', () => {
  let s = playFirst(arena({ me: { hand: ['y_48', 'y_60'] }, foe: { field: ['y_28'] } }), 'y_48');
  s = choose(s, 'yes'); s = choose(s, hand(s)[0]);
  assert.equal(field(s).length, 0); assert.equal(s.cards[hand(s)[0]].revealed, true); assert.equal(s.effectRoll, undefined);
});
test('y_49 ふろんと: successful dodge cancels attack effects and リンネ, exhausts attacker', () => {
  let s = arena({ me: { field: ['y_20'] }, foe: { field: ['y_49'], hand: ['y_33'] } });
  s.players[1].exSkills = { dice: { uses: 1 } }; const uid = field(s)[0];
  s = attack(s); assert.equal(s.pending.task.op, 'die'); s = choose(s, '6');
  assert.equal(s.pending, null); assert.equal(s.players[1].points, 12); assert.equal(s.cards[uid].exhausted, true); assert.equal(s.cards[hand(s, 1)[0]].revealed, false);
});
test('y_50 もなか: can act only when all normal skills are depleted', () => {
  const s = arena({ me: { field: ['y_50'] } }), uid = field(s)[0];
  assert.equal(canAttack(s, 0, uid, 'leader', catalog), false); s.players[0].skills.fill(0); assert.equal(canAttack(s, 0, uid, 'leader', catalog), true);
});
test('y_51 オフティ二: ten nap units draw twice and steal three', () => {
  let s = playFirst(arena({ me: { hand: ['y_51'], nap: Array(10).fill('y_9'), points: 8 } }), 'y_51');
  s = draws(s); assert.equal(hand(s).length, 2); assert.equal(s.players[0].points, 11); assert.equal(s.players[1].points, 9);
});
test('y_52 レンテ: credits stack, one credit chooses one textual die, survives save/restore', () => {
  let s = arena({ me: { hand: ['y_52', 'y_52', 'y_59'], pp: 12 } }); s.players[0].ppBonus = 10;
  s = playFirst(s, 'y_52'); s = playFirst(s, 'y_52'); assert.equal(s.players[0].exSkills.dice.uses, 2);
  s.players[0].pp = 5; s = choose(playFirst(s, 'y_59'), 'no');
  s = restoreGame(JSON.parse(JSON.stringify(s)), catalog); assert.ok(s); s = choose(s, '6');
  assert.equal(stats(s, newest(s))[0], 6); assert.equal(s.players[0].exSkills.dice.uses, 1);
});
test('y_53 しゅれい: an ineligible strawberry taunt cannot attract a grape-only selection', () => {
  let s = arena({ me: { hand: ['y_53'] }, foe: { field: ['y_28', 'y_37'] } }); const uid = field(s, 1)[1];
  s = choose(playFirst(s, 'y_53'), 'grape'); assert.deepEqual(optionIds(s), [uid]); s = choose(s, uid); assert.ok(!field(s, 1).includes(uid));
});
test('y_54 しゅお / y_55 あみの: resetting counts never erases unique-skill history', () => {
  let s = arena({ me: { hand: ['y_55', 'y_54', 'y_9'], pp: 12 } }); s.players[0].skills[1] = 0; s.players[0].skillHistory = [1];
  s = playFirst(s, 'y_55'); assert.equal(s.players[0].skills[1], 1); assert.deepEqual(s.players[0].skillHistory, [1]);
  s = choose(playFirst(s, 'y_54'), hand(s).at(-1)); const count = hand(s).length; s = draws(s); assert.equal(hand(s).length, count + 1);
});
test('y_56 ぎってぃ: actor chooses decks and random exile triggers orange cards', () => {
  let s = arena({ me: { hand: ['y_56'] }, foe: { yojo: ['y_116'], sweet: ['s_37'] } });
  s.players[1].yojo = s.players[1].yojo.slice(0, 1); s.players[1].sweet = s.players[1].sweet.slice(0, 1);
  s = choose(playFirst(s, 'y_56'), 'yojo'); s = draws(choose(s, 'sweet'));
  assert.deepEqual(idsOf(s, s.players[1].exile), ['y_116', 's_37']); assert.equal(s.players[0].points, 10);
  s = arena({ me: { hand: ['y_56'] } }); s.players[1].yojo = []; s.players[1].sweet = [];
  s = playFirst(s, 'y_56'); assert.equal(s.pending, null); assert.ok(s.cards[field(s)[0]].keywords.includes('taunt'));
});
test('y_57 かんらん: hand discard hits randomly; hiding does not block random damage', () => {
  let s = arena({ me: { hand: ['y_5', 'y_57'] }, foe: { field: ['y_62'] } }); const uid = field(s, 1)[0]; s.cards[uid].hiding = true;
  s = choose(playFirst(s, 'y_5'), hand(s)[1]); s = draws(s); assert.equal(s.cards[uid].damage, 3);
});
test('y_58 まめろん: defend debuffs attacker; enemy sweets deal two extra damage', () => {
  let s = arena({ me: { field: ['y_49'] }, foe: { field: ['y_58'] } }); const uid = field(s)[0];
  s = attack(s); assert.equal(s.cards[uid].attackBonus, 2); assert.equal(field(s).length, 0);
  s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_58'] } }); const target = field(s, 1)[0]; s = choose(playFirst(s, 's_6'), target); assert.ok(!field(s, 1).includes(target));
});
test('y_59 ストラ: optional loss is before hunger check and chosen die buffs attack', () => {
  let s = arena({ me: { hand: ['y_59'], points: 9 } }); s.players[0].exSkills = { dice: { uses: 1 } };
  s = draws(choose(playFirst(s, 'y_59'), 'yes')); s = choose(s, '6'); s = draws(s);
  assert.equal(s.players[0].points, 5); assert.deepEqual(stats(s, newest(s)), [6, 4]); assert.ok(s.cards[newest(s)].keywords.includes('pierce'));
});
test('y_60 レンス: grants strawberry only to revealed hand units, preserving original fruit', () => {
  let s = playFirst(arena({ me: { hand: ['y_60', 'y_37', 's_19'] } }), 'y_60'); const uid = hand(s)[0]; s = choose(choose(s, uid), 'done');
  assert.deepEqual(s.cards[uid].fruitTypes, ['strawberry']); assert.equal(catalog[s.cards[uid].cardId].fruit, 'grape'); assert.equal(s.cards[hand(s)[1]].revealed, false);
});
test('y_61 いろは: unplayed sweets can be recovered at zero cost after seven sweets; twelve wins', () => {
  let s = arena({ me: { hand: ['y_61'], nap: ['s_19', 's_6'] } }); s.players[0].played = Array(7).fill('s_19');
  s = playFirst(s, 'y_61'); for (const uid of [...s.players[0].nap]) s = choose(s, uid);
  assert.ok(hand(s).every(uid => costOf(s, uid, catalog, 0) === 0));
  s = arena({ me: { hand: ['y_61'] } }); s.players[0].played = Array(12).fill('s_19'); s = playFirst(s, 'y_61'); assert.equal(s.winner, 0);
});
test('y_62 じょんこ: hide overrides guard/taunt selection, effect damage still applies, reentry hides again', () => {
  let s = arena({ me: { hand: ['s_8'], field: ['y_20'] }, foe: { field: ['y_62'] } }); const uid = field(s, 1)[0]; s.cards[uid].hiding = true; s.cards[uid].keywords.push('guard', 'taunt');
  assert.equal(canAttack(s, 0, field(s)[0], 'leader', catalog), true); assert.equal(canAttack(s, 0, field(s)[0], uid, catalog), false);
  s = playFirst(s, 's_8'); assert.equal(s.cards[uid].damage, 3);
  s = arena({ me: { playable: 'p_5', points: 10 }, foe: { field: ['y_62'] } }); const target = field(s, 1)[0]; s.cards[target].hiding = false;
  s = choose(skill(s, 1), target); s = draws(s); assert.ok(field(s).includes(target)); assert.equal(s.cards[target].hiding, true); assert.equal(s.players[1].points, 9);
});
test('y_63 みゅーとん: draw comes before optional revelations and per-fruit/real-sweet counts', () => {
  let s = arena({ me: { hand: ['y_63', 'y_60', 's_19'], points: 8, yojo: ['y_60'] }, foe: { field: ['y_8'] } });
  const target = field(s, 1)[0]; s = choose(playFirst(s, 'y_63'), 'yojo'); for (const uid of [...hand(s)]) s = choose(s, uid); s = draws(choose(s, 'done'));
  assert.equal(s.players[0].points, 10); assert.equal(s.players[1].points, 10); assert.equal(s.cards[target].damage, 1);
});
test('y_64 うぃまる: barrier can activate with empty decks and still counts as eating', () => {
  let s = arena({ me: { field: ['y_25'] }, foe: { hand: ['y_64'] } }); const attacker = field(s)[0], uid = hand(s, 1)[0]; s.players[1].yojo = []; s.players[1].sweet = [];
  s = attack(s, 'leader'); s = choose(s, uid); assert.equal(s.players[1].points, 12); assert.equal(s.cards[attacker].ateOn, s.turn); assert.ok(s.players[1].nap.includes(uid));
});
