import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, costOf, fruitsOf, newGame, sandboxRules, validateDeck } from '../dist/index.js';
import { arena, catalog, choose, draws, field, hand, idsOf, optionIds, playFirst, run, stats } from './helpers.mjs';

test('orange environment: ぷぷりえーる is forbidden in either player deck', () => {
  const strawberry = { name: 'いちご', playable: 'p_0', yojo: Array(20).fill('y_9'), sweet: ['s_24', ...Array(9).fill('s_41')] };
  const orange = { name: 'オレンジ', playable: 'p_0', yojo: Array(20).fill('y_113'), sweet: Array(10).fill('s_41') };
  assert.ok(validateDeck(strawberry, catalog).some(error => error.includes('オレンジ環境')));
  const plain = { ...strawberry, sweet: ['s_24', ...Array(9).fill('s_19')] };
  assert.deepEqual(validateDeck(plain, catalog), []);
  assert.throws(() => newGame([plain, orange], catalog, sandboxRules, 7), /ぷぷりえーる/);
});

for (const id of ['s_28', 's_29', 's_30', 's_31']) test(`${id} チャイ: first kind destroys then recovers PP; only one copy per deck`, () => {
  let s = arena({ me: { hand: [id], pp: 6 }, foe: { field: ['y_9'] } }); const uid = field(s, 1)[0], before = s.players[0].pp; s = choose(playFirst(s, id), uid); assert.ok(!field(s, 1).includes(uid)); assert.equal(s.players[0].pp, before - catalog[id].cost + 1);
  const deck = { name: 'チャイ', playable: 'p_0', yojo: Array(20).fill('y_31'), sweet: [id, id, ...Array(8).fill('s_37')] }; assert.ok(validateDeck(deck, catalog).some(error => error.includes('1枚まで')));
});
test('chai: second kind can be evaded, third ignores hide/evade, fourth also steals', () => {
  let s = arena({ me: { hand: ['s_29'] }, foe: { field: ['y_49'] } }); s.players[0].played.push('s_28'); s.players[1].exSkills = { dice: { uses: 1 } }; const uid = field(s, 1)[0]; s = choose(playFirst(s, 's_29'), uid); s = choose(s, '6'); assert.ok(field(s, 1).includes(uid));
  s = arena({ me: { hand: ['s_30'] }, foe: { field: ['y_62'] } }); s.players[0].played.push('s_28', 's_29'); const hidden = field(s, 1)[0]; s.cards[hidden].hiding = true; s.cards[hidden].keywords.push('evade'); s.players[1].exSkills = { dice: { uses: 1 } }; s = draws(choose(playFirst(s, 's_30'), hidden)); assert.ok(s.players[1].exile.includes(hidden)); assert.equal(s.players[1].exSkills.dice.uses, 1); assert.equal(hand(s).length, 1);
  s = arena({ me: { hand: ['s_31'], points: 8 }, foe: { field: ['y_9'] } }); s.players[0].played.push('s_28', 's_29', 's_30'); s = draws(choose(playFirst(s, 's_31'), field(s, 1)[0])); assert.equal(s.players[0].points, 11); assert.equal(s.players[1].points, 9);
});
test('s_32 カップアイス: increases stored count and spends an arbitrary amount on chosen damage', () => {
  let s = arena({ me: { hand: ['s_32'] }, foe: { field: ['y_49'] } }); s.players[0].ice = 2; const uid = field(s, 1)[0]; s = choose(playFirst(s, 's_32'), '3'); s = choose(s, uid); assert.equal(s.players[0].ice, 0); assert.equal(s.cards[uid].damage, s.effectRoll.value >= 5 ? 0 : 3);
});
test('s_33 シングルコーン: optional spend2 deals2 and draws; declining keeps stored ice', () => {
  let s = arena({ me: { hand: ['s_33'] }, foe: { field: ['y_9'] } }); s = choose(playFirst(s, 's_33'), '2'); s = draws(choose(s, field(s, 1)[0])); assert.equal(s.players[0].ice, 0); assert.equal(hand(s).length, 1);
  s = choose(playFirst(arena({ me: { hand: ['s_33'] } }), 's_33'), '0'); assert.equal(s.players[0].ice, 2);
});
test('s_34 ダブルコーン: AoE and random follow-up ignore おにごっこ', () => {
  let s = arena({ me: { hand: ['s_34'] }, foe: { field: ['y_49'] } }); s.players[1].exSkills = { dice: { uses: 1 } }; const uid = field(s, 1)[0]; s = choose(playFirst(s, 's_34'), '2'); assert.equal(s.cards[uid].damage, 2); s = choose(s, 'yes'); assert.equal(s.cards[uid].damage, 5); assert.equal(s.players[1].exSkills.dice.uses, 1);
});
test('s_35 カラフルハーフタワー: two payments of4 give +6/+6', () => {
  let s = arena({ me: { hand: ['s_35'], field: ['y_9'] } }); s.players[0].ice = 4; const uid = field(s)[0], before = stats(s, uid); s = choose(playFirst(s, 's_35'), '8'); s = choose(s, uid); assert.deepEqual(stats(s, uid), before.map(n => n + 6)); assert.equal(s.players[0].ice, 0);
});
test('s_36 チョコミントタワー: blocked before own turn6, spends ice on point reduction', () => {
  let s = arena({ me: { hand: ['s_36'], turns: 5 } }); assert.match(applyCommand(s, { type: 'play', actor: 0, uid: hand(s)[0] }, catalog).error, /使えません/);
  s = arena({ me: { hand: ['s_36'], turns: 6 } }); s = draws(choose(playFirst(s, 's_36'), '4')); assert.equal(s.players[1].points, 8); assert.equal(s.players[0].ice, 0);
});
test('s_37 カップケーキ: draws exactly one chosen card', () => {
  let s = playFirst(arena({ me: { hand: ['s_37'] } }), 's_37'); s = draws(s, 'sweet'); assert.equal(hand(s).length, 1); assert.equal(catalog[s.cards[hand(s)[0]].cardId].type, 'sweet');
});
test('s_38 いっしょにおしゃしん: condition declaration controls both draws and consumes no sweet boost', () => {
  let s = arena({ me: { hand: ['s_38'] } }); s.players[0].sweetBoost = 2; s = playFirst(s, 's_38'); assert.equal(s.players[0].sweetBoost, 2); s = draws(choose(s, 'yes')); assert.equal(hand(s).length, 1); assert.equal(hand(s, 1).length, 1);
  s = choose(playFirst(arena({ me: { hand: ['s_38'] } }), 's_38'), 'no'); assert.equal(hand(s).length, 0);
});
for (const [id, fruit] of [['s_39', 'melon'], ['s_40', 'grape']]) test(`${id}: permanent fruit addition preserves original types in hand/deck/nap, extraPP searches`, () => {
  let s = arena({ me: { hand: [id, 'y_9'], yojo: ['y_8'], nap: ['y_37'], field: ['y_9'] } }); const uid = hand(s)[1], top = s.players[0].yojo[0], nap = s.players[0].nap[0], onField = field(s)[0]; s = choose(playFirst(s, id), 'yes'); s = choose(s, top);
  assert.ok(fruitsOf(s, uid, catalog).includes(fruit)); assert.ok(fruitsOf(s, top, catalog).includes(fruit)); assert.ok(fruitsOf(s, nap, catalog).includes(fruit)); assert.ok(!fruitsOf(s, onField, catalog).includes(fruit)); assert.ok(hand(s).includes(top));
});
test('s_41 あんこ: damages all and reduces1, prior custard adds another reduction', () => {
  let s = arena({ me: { hand: ['s_41'] }, foe: { field: ['y_49'] } }); const uid = field(s, 1)[0]; s.players[0].played.push('s_42'); s = draws(playFirst(s, 's_41')); assert.equal(s.cards[uid].damage, 1); assert.equal(s.players[1].points, 10);
});
test('s_42 カスタード: all allies gain HP and prior anko adds healing', () => {
  let s = arena({ me: { hand: ['s_42'], field: ['y_9', 'y_9'], points: 8 } }); s.players[0].played.push('s_41'); s = playFirst(s, 's_42'); assert.ok(field(s).every(uid => s.cards[uid].hpBonus === 1)); assert.equal(s.players[0].points, 10);
});
test('s_42 カスタード: its additional recovery triggers ここあの献身 separately', () => {
  let s = arena({ me: { hand: ['s_42'], points: 8 } }); s.players[0].played.push('s_41'); s.players[0].exSkills = { healing: { uses: 3 } };
  s = playFirst(s, 's_42'); assert.equal(s.players[0].points, 12); assert.equal(s.players[0].exSkills.healing.uses, 1);
});
test('s_43 いぬさんだんご: cannot take the same card kind twice, different fruits of the same name are allowed', () => {
  let s = arena({ me: { hand: ['s_43'], yojo: ['y_13', 'y_13', 'y_37'] } }); const cards = s.players[0].yojo.slice(0, 3); s = choose(playFirst(s, 's_43'), cards[0]); assert.ok(!optionIds(s).includes(cards[1])); assert.ok(optionIds(s).includes(cards[2])); s = choose(s, cards[2]); assert.deepEqual(idsOf(s, hand(s)), ['y_13', 'y_37']);
});
test('s_44 ぜんりょくおうえん: reveal counts distinct nap character/fruit kinds only once, then buffs8/10', () => {
  let s = arena({ me: { hand: ['s_44'], field: ['y_9'], nap: ['y_24', 'y_24', 'y_40', 'y_25'] } }); const uid = hand(s)[0], ally = field(s)[0]; s = run(s, { type: 'reveal', actor: 0, uid }); assert.equal(costOf(s, uid, catalog, 0), 7); s = run(s, { type: 'reveal', actor: 0, uid }); assert.equal(costOf(s, uid, catalog, 0), 7); s = choose(playFirst(s, 's_44'), ally); assert.equal(s.cards[ally].attackBonus, 8); assert.equal(s.cards[ally].hpBonus, 10);
});
test('s_45 どんぐり: non-sweet count can be spent during either turn; PP addition exceeds the ordinary refill cap', () => {
  let s = arena({ me: { hand: ['s_45'], pp: 2, turns: 2, ppBonus: 0 } }); s.players[0].sweetBoost = 1; s = playFirst(s, 's_45'); assert.equal(s.players[0].acorns, 1); assert.equal(s.players[0].sweetBoost, 1); s.players[0].pp = 2;
  s = run(s, { type: 'acorn', actor: 0, mode: 'pp' }); assert.equal(s.players[0].pp, 3); assert.equal(s.players[0].acorns, 0);
  s.players[0].acorns = 1; s.active = 1; s = draws(run(s, { type: 'acorn', actor: 0, mode: 'draw' })); assert.equal(hand(s).length, 1);
});
test('selected dodge blocks only that target and preserves bonus draw; multi-target rolls independently', () => {
  let s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_49'] } }); s.players[0].played.push('s_7'); s.players[1].exSkills = { dice: { uses: 1 } }; const uid = field(s, 1)[0]; s = choose(playFirst(s, 's_6'), uid); s = choose(s, '6'); assert.equal(s.cards[uid].damage, 0); s = draws(s); assert.equal(hand(s).length, 1);
  s = arena({ me: { hand: ['y_26'] }, foe: { field: ['y_49', 'y_49'] } }); s.players[1].exSkills = { dice: { uses: 2 } }; const [a, b] = field(s, 1); s = choose(playFirst(s, 'y_26'), 'two'); s = choose(s, a); s = choose(s, '6'); s = choose(s, b); s = choose(s, '1'); assert.equal(s.cards[a].damage, 0); assert.equal(s.cards[b].damage, 4); assert.equal(s.players[1].exSkills.dice.uses, 0);
});
