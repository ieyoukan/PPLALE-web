import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, buildPosition, canPlay, costOf, fruitsOf, legalMoves, positionOf, restoreGame } from '../dist/index.js';
import { arena, catalog, choose, draws, field, hand, idsOf, newest, optionIds, playFirst, run, stats } from './helpers.mjs';
const end = s => run(s, { type: 'end', actor: s.active });

for (const [id, found] of [['y_113', 's_6'], ['y_119', 's_9']]) test(`${id}: searches/reveals an eligible sweet and makes it free`, () => {
  let s = arena({ me: { hand: [id], sweet: [found] } }); const uid = s.players[0].sweet[0];
  s = choose(playFirst(s, id), uid); assert.ok(hand(s).includes(uid)); assert.equal(s.cards[uid].revealed, true); assert.equal(costOf(s, uid, catalog, 0), 0);
});
test('y_114 リマチャン: opponent start checks unspent PP before any refill', () => {
  let s = arena({ me: { field: ['y_114'], pp: 3 }, foe: { field: ['y_9'] } }); const target = field(s, 1)[0];
  s = draws(end(s)); assert.equal(hand(s).length, 1); assert.equal(s.cards[target].damage, 3); assert.equal(s.players[0].pp, 3);
});
test('y_115 りりぃ: HP0 triggers, makes/bounces もちだ and counts the departure', () => {
  const s = playFirst(arena({ me: { hand: ['y_115'] } }), 'y_115');
  assert.deepEqual(idsOf(s, hand(s)), ['token_mochida']); assert.equal(field(s).length, 0); assert.equal(s.players[0].mochidaLeft, 1);
});
test('y_116 キラチャン: effect exile triggers point loss, hand-limit exile does not', () => {
  let s = arena({ me: { hand: ['y_136', 'y_116'] } }); s = draws(choose(playFirst(s, 'y_136'), hand(s)[1])); assert.equal(s.players[1].points, 10);
  s = arena({ me: { hand: Array(10).fill('y_116') } }); s = choose(end(s), hand(s)[0]); assert.equal(s.players[1].points, 12);
});
test('y_117 なかよし: exile offers a damage/draw choice and destruction summons a cat', () => {
  let s = arena({ me: { hand: ['y_136', 'y_117'] }, foe: { field: ['y_9'] } }); s = choose(playFirst(s, 'y_136'), hand(s)[1]);
  assert.ok(optionIds(s).includes('damage')); s = choose(s, 'damage'); s = choose(s, field(s, 1)[0]); s = draws(s); assert.equal(field(s, 1).length, 0);
  s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_117'] } }); s = choose(playFirst(s, 's_6'), field(s, 1)[0]); assert.deepEqual(idsOf(s, field(s, 1)), ['token_cat']);
});
test('y_118 さおちゃん: end adds four PP usable during opponent turn; next own turn refills', () => {
  let s = draws(end(arena({ me: { field: ['y_118'], pp: 1, ppBonus: 0 } }))); assert.equal(s.players[0].pp, 5);
  s = draws(end(s)); assert.equal(s.players[0].pp, 3);
});
test('y_120 幸野粉白: only its first play as the second player adds max PP', () => {
  let s = arena({ me: { hand: ['y_120'], ppBonus: 0 }, rules: { firstPlayer: 1 } }); s = draws(playFirst(s, 'y_120')); assert.equal(s.players[0].ppBonus, 1);
  s = arena({ me: { hand: ['y_120'], ppBonus: 0 }, rules: { firstPlayer: 1 } }); s.players[0].played.push('y_120'); s = draws(playFirst(s, 'y_120')); assert.equal(s.players[0].ppBonus, 0);
});
test('y_121 レンス: gains a manual skill with ゼロオレ and restricts next-turn hand plays', () => {
  let s = playFirst(arena({ me: { hand: ['y_121'], nap: ['y_48'] }, foe: { hand: ['y_37', 'y_9'] } }), 'y_121');
  assert.equal(s.players[0].exSkills.strawberryHunt.uses, 1);
  assert.ok(legalMoves(s, 0, catalog).some(m => m.command.type === 'exSkill'));
  s = run(s, { type: 'exSkill', actor: 0, skill: 'strawberryHunt' }); s = draws(end(s));
  const grape = hand(s, 1).find(uid => s.cards[uid].cardId === 'y_37'); assert.match(runError(s, { type: 'play', actor: 1, uid: grape }), /イチゴ狩り/);
  assert.equal(canPlay(s, 1, grape, catalog), false);
  const strawberry = hand(s, 1).find(uid => s.cards[uid].cardId === 'y_9'); assert.equal(canPlay(s, 1, strawberry, catalog), true);
});
function runError(s, command) { return applyCommand(s, command, catalog).error; }
test('y_122 リンネ: play skips the next turn draw; hand response pays four and exiles itself', () => {
  let s = playFirst(arena({ me: { hand: ['y_122'] } }), 'y_122'); s = end(s); assert.equal(s.pending, null); assert.equal(s.active, 1);
  s = arena({ me: { hand: ['y_122'], pp: 4 } }); const uid = hand(s)[0]; s = end(s); assert.equal(s.pending.task.actor, 0); s = choose(s, uid);
  assert.equal(s.players[0].pp, 0); assert.ok(s.players[0].exile.includes(uid)); s = draws(s); assert.equal(hand(s).length, 1); assert.equal(hand(s, 1).length, 0);
});
test('y_123 ここあ: persists for three healing events even after leaving the field', () => {
  let s = playFirst(arena({ me: { hand: ['y_123', 's_42'], nap: ['y_29'], points: 8 } }), 'y_123');
  assert.equal(s.players[0].exSkills.healing.uses, 3); s = playFirst(s, 's_42'); assert.equal(s.players[0].points, 10); assert.equal(s.players[0].exSkills.healing.uses, 2);
});
test('y_124 ビデカメ: leftover four PP at opponent start raises max PP', () => {
  const s = end(arena({ me: { field: ['y_124'], pp: 4, ppBonus: 0 } })); assert.equal(s.players[0].ppBonus, 1);
});
test('y_125 ようかん: completes two draws before ending its turn', () => {
  let s = playFirst(arena({ me: { hand: ['y_125'] } }), 'y_125'); s = choose(s, 'yojo'); assert.equal(s.active, 0); s = choose(s, 'sweet'); assert.equal(s.active, 1); assert.equal(hand(s).length, 2);
});
test('y_126 ももか仮: exact declared fruit/card match takes the top at zero cost', () => {
  let s = arena({ me: { hand: ['y_126'], yojo: ['y_37'] } }); const top = s.players[0].yojo[0]; s = choose(playFirst(s, 'y_126'), 'y_37'); assert.ok(hand(s).includes(top)); assert.equal(costOf(s, top, catalog, 0), 0);
  s = arena({ me: { hand: ['y_126'], yojo: ['y_37'] } }); const n = s.players[0].yojo.length; s = choose(playFirst(s, 'y_126'), 'y_13'); assert.equal(hand(s).length, 0); assert.equal(s.players[0].yojo.length, n);
});
test('y_127 ひらくぅ。: a successful dodge counters for attacker attack, canceled attacker effects never run', () => {
  let s = arena({ me: { field: ['y_20'] }, foe: { field: ['y_127'] } }); const attacker = field(s)[0], target = field(s, 1)[0]; s.players[1].exSkills = { dice: { uses: 1 } };
  const amount = stats(s, attacker)[0]; s = run(s, { type: 'attack', actor: 0, uid: attacker, target }); s = draws(choose(s, '6'));
  assert.equal(s.players[1].points, 12); assert.equal(s.players[0].points, 12 - amount); assert.equal(s.cards[target].damage, 0); assert.equal(s.cards[attacker].damage, amount);
});
test('y_128 氷花: four tops go one each to hand/deck/nap/exile; exile triggers are retained', () => {
  let s = arena({ me: { hand: ['y_128'], yojo: ['y_9', 'y_8', 'y_5', 'y_116'] } }); const tops = s.players[0].yojo.slice(0, 4); s = playFirst(s, 'y_128');
  for (let i = 0; i < 4; i++) { s = choose(s, tops[i]); s = choose(s, ['hand', 'yojo', 'nap', 'exile'][i]); }
  s = draws(s); assert.ok(hand(s).includes(tops[0])); assert.ok(s.players[0].yojo.includes(tops[1])); assert.ok(s.players[0].nap.includes(tops[2])); assert.ok(s.players[0].exile.includes(tops[3])); assert.equal(s.players[1].points, 10);
});
test('y_129 ちさと: heals, searches by Ex text, then chosen 1d6 discounts the card', () => {
  let s = arena({ me: { hand: ['y_129'], yojo: ['y_52'], points: 8 } }); const top = s.players[0].yojo[0]; s.players[0].exSkills = { dice: { uses: 1 } };
  s = choose(playFirst(s, 'y_129'), top); s = choose(s, '6'); assert.equal(s.players[0].points, 9); assert.equal(s.cards[top].revealed, true); assert.equal(costOf(s, top, catalog, 0), 3);
});
test('y_130 ぅぁゃょ: optional two nap exiles trigger effects and give +2/+2 plus a draw', () => {
  let s = arena({ me: { hand: ['y_130'], nap: ['y_116', 'y_9'] } }); const nap = [...s.players[0].nap]; s = choose(playFirst(s, 'y_130'), 'yes'); for (const uid of nap) s = choose(s, uid); s = draws(s);
  assert.deepEqual(s.players[0].exile, nap); assert.equal(s.cards[field(s)[0]].attackBonus, 2); assert.equal(hand(s).length, 1); assert.equal(s.players[1].points, 10);
});
test('y_130 ぅぁゃょ: completes the draw before gaining +2/+2', () => {
  let s = arena({ me: { hand: ['y_130'], nap: ['y_9', 'y_9'] } }); const nap = [...s.players[0].nap];
  s = choose(playFirst(s, 'y_130'), 'yes'); for (const uid of nap) s = choose(s, uid);
  const uid = field(s)[0]; assert.equal(s.pending.task.op, 'draw'); assert.equal(s.cards[uid].attackBonus, 0);
  s = draws(s); assert.equal(s.cards[uid].attackBonus, 2); assert.equal(s.cards[uid].hpBonus, 2);
});
test('y_131 しゅみあ: draws twice before discarding; destruction also discards', () => {
  let s = draws(playFirst(arena({ me: { hand: ['y_131'] } }), 'y_131')); assert.equal(hand(s).length, 2); s = choose(s, hand(s)[0]); assert.equal(hand(s).length, 1);
  s = run(s, { type: 'adjust', actor: 0, resource: 'damage', uid: field(s)[0], delta: 20 }, true); s = choose(s, hand(s)[0]); assert.equal(hand(s).length, 0);
});
test('y_132 ぽめちゃん: acquired abyss triggers only twice, including its own destruction', () => {
  let s = playFirst(arena({ me: { hand: ['y_132'], field: ['y_9', 'y_9'] } }), 'y_132');
  for (const uid of [...field(s)]) s = draws(run(s, { type: 'adjust', actor: 0, resource: 'damage', uid, delta: 20 }, true));
  assert.equal(s.players[1].points, 10); assert.equal(s.players[0].exSkills.abyss.uses, 0);
});
test('y_133 にゃがれ: random deck exile triggers キラチャン', () => {
  let s = arena({ me: { hand: ['y_133'], yojo: ['y_116', 'y_116'] } }); s.players[0].yojo = s.players[0].yojo.slice(0, 2); s = draws(playFirst(s, 'y_133')); assert.equal(s.players[0].exile.length, 2); assert.equal(s.players[1].points, 8);
});
test('y_134 しゃるる。: departure history determines hand tokens', () => {
  let s = arena({ me: { hand: ['y_134'] } }); s.players[0].mochidaLeft = 3; s = playFirst(s, 'y_134'); assert.deepEqual(idsOf(s, hand(s)), Array(3).fill('token_mochida'));
});
test('y_135 よみ: revives from nap without hand-only effects; excludes costs above five', () => {
  let s = arena({ me: { hand: ['y_135'], nap: ['y_37', 'y_62'] } }); const uid = s.players[0].nap[0]; s = playFirst(s, 'y_135'); assert.deepEqual(optionIds(s), [uid]); s = choose(s, uid); assert.deepEqual(stats(s, uid), [2, 2]); assert.equal(hand(s).length, 0);
});
test('y_136 くく: hand exile is distinct from discard, then draws three', () => {
  let s = arena({ me: { hand: ['y_136', 'y_5', 'y_5'] } }); const cards = hand(s).slice(1); s = playFirst(s, 'y_136'); for (const uid of cards) s = choose(s, uid); s = draws(s); assert.equal(hand(s).length, 3); assert.equal(s.players[0].nap.length, 0); assert.deepEqual(s.players[0].exile, cards);
});
test('y_137 もちょちょ: two revealed baked sweets receive a one-cost discount', () => {
  let s = arena({ me: { hand: ['y_137'], sweet: ['s_41', 's_42'] } }); const cards = s.players[0].sweet.slice(0, 2); s = playFirst(s, 'y_137'); for (const uid of cards) s = choose(s, uid); assert.ok(cards.every(uid => hand(s).includes(uid) && s.cards[uid].revealed && costOf(s, uid, catalog, 0) === 1));
});
test('y_138 おうか: hand play and effect exile each summon two もちだ', () => {
  let s = playFirst(arena({ me: { hand: ['y_138'] } }), 'y_138'); assert.equal(idsOf(s, field(s)).filter(id => id === 'token_mochida').length, 2);
  s = arena({ me: { hand: ['y_136', 'y_138'] } }); s = choose(playFirst(s, 'y_136'), hand(s)[1]); s = draws(s); assert.equal(idsOf(s, field(s)).filter(id => id === 'token_mochida').length, 2);
});
test('y_139 yuyuchi: one die at six gives both cumulative buffs', () => {
  let s = arena({ me: { hand: ['y_139'] } }); s.players[0].exSkills = { dice: { uses: 1 } }; s = choose(playFirst(s, 'y_139'), '6'); assert.equal(s.cards[newest(s)].attackBonus, 4); assert.equal(s.cards[newest(s)].hpBonus, 4);
});
test('y_140 なお: nonstacking dagger boosts two PP recoveries per own turn', () => {
  let s = playFirst(arena({ me: { hand: ['y_140', 's_27', 's_27'], pp: 10 } }), 'y_140'); assert.equal(s.players[0].pp, 8);
  // No real sweet is available to give, so each recovery resolves directly.
  s = playFirst(s, 's_27'); assert.equal(s.players[0].pp, 10); assert.equal(s.players[0].exSkills.dagger.usedThisTurn, 2);
});
test('y_141 オズちゃんぽん: entry recovers PP and leftover four destroys randomly at opponent start', () => {
  let s = playFirst(arena({ me: { hand: ['y_141'], pp: 6 }, foe: { field: ['y_62'] } }), 'y_141'); assert.equal(s.players[0].pp, 5); s = end(s); assert.equal(field(s, 1).length, 1, 'effect destruction immunity protects the target');
});
test('y_142 りんまる。: three acquired Ex kinds grant Alice, usable once each turn', () => {
  let s = arena({ me: { hand: ['y_142'], pp: 8 } }); s.players[0].exSkills = { dice: { uses: 0 }, healing: { uses: 0 }, abyss: { uses: 0 } }; s = playFirst(s, 'y_142'); assert.equal(s.players[0].pp, 6);
  s = run(s, { type: 'exSkill', actor: 0, skill: 'alice' }); assert.equal(s.cards[field(s)[0]].attackBonus, 3); assert.ok(!legalMoves(s, 0, catalog).some(m => m.command.type === 'exSkill' && m.command.skill === 'alice'));
});
test('y_143 いりあい: smoke affects card-effect draws, excludes ordinary turn draw', () => {
  let s = playFirst(arena({ me: { hand: ['y_143'] }, foe: { hand: ['s_37'] } }), 'y_143'); s = draws(end(s)); assert.equal(s.players[1].points, 12); s = draws(playFirst(s, 's_37')); assert.equal(s.players[1].points, 11);
});
test('y_144 みか: only revealed rabbit names count; optional revelation can be declined', () => {
  const rabbit = Object.values(catalog).find(c => /うさぎ|ラビット/.test(c.name)).id;
  let s = arena({ me: { hand: ['y_144', rabbit] } }); s = playFirst(s, 'y_144'); s = draws(choose(choose(s, hand(s)[0]), 'done')); assert.equal(s.players[1].points, 11);
});
test('y_145 ぶらんちゃん: orange unit effects/combat are immune; sweets and other fruits still damage it', () => {
  let s = arena({ me: { field: ['y_147'] }, foe: { field: ['y_145'] } }); const target = field(s, 1)[0]; s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target }); assert.equal(s.cards[target].damage, 0);
  s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_145'] } }); const uid = field(s, 1)[0]; s = choose(playFirst(s, 's_6'), uid); assert.equal(s.cards[uid].damage, 3);
});
test('y_145 ぶらんちゃん: combat destruction reduces points by the attacker current attack', () => {
  let s = arena({ me: { field: ['y_25'] }, foe: { field: ['y_145'] } }); const attacker = field(s)[0], target = field(s, 1)[0]; s.cards[attacker].attackBonus = 3; const n = stats(s, attacker)[0]; s = draws(run(s, { type: 'attack', actor: 0, uid: attacker, target })); assert.equal(s.players[0].points, 12 - n);
});
test('y_146 ちむどんどん！: nap cost is ten and cannot be effect-exiled; all ten costs win', () => {
  const costs = Array.from({ length: 9 }, (_, i) => Object.values(catalog).find(c => c.type === 'yojo' && c.cost === i + 1)?.id).filter(Boolean);
  assert.equal(costs.length, 9);
  let s = playFirst(arena({ me: { hand: ['y_146'], nap: [...costs, 'y_146'] } }), 'y_146'); assert.equal(s.winner, 0);
  s = arena({ me: { hand: ['y_130'], nap: ['y_146', 'y_9'] } }); s = playFirst(s, 'y_130'); assert.equal(s.pending, null);
});
test('y_147 ほとり丸: attack AoE deaths reduce opponent points before combat', () => {
  let s = arena({ me: { field: ['y_147'] }, foe: { field: ['y_9', 'y_9'], points: 4 } }); const attacker = field(s)[0]; s = run(s, { type: 'attack', actor: 0, uid: attacker, target: field(s, 1)[0] }); assert.equal(s.players[1].points, 2); assert.equal(field(s, 1).length, 0);
});
test('y_148 おさかな: reveal plus leftover four discounts by two at opponent start', () => {
  let s = arena({ me: { hand: ['y_148'], pp: 4 } }); const uid = hand(s)[0]; s = run(s, { type: 'reveal', actor: 0, uid }); s = end(s); assert.equal(s.cards[uid].costDelta, -2);
});
for (const id of ['y_149', 'y_150']) test(`${id}: revealed real sweet plays discount it, currency does not`, () => {
  let s = arena({ me: { hand: [id, 's_45', 's_42'], pp: 12 } }); const uid = hand(s)[0]; s = run(s, { type: 'reveal', actor: 0, uid }); s = playFirst(s, 's_45'); assert.equal(s.cards[uid].costDelta, 0); s = playFirst(s, 's_42'); assert.equal(s.cards[uid].costDelta, -1);
});
test('y_150 ゆに: plays draw only from sweets then recover three PP', () => {
  let s = playFirst(arena({ me: { hand: ['y_150'], pp: 10 } }), 'y_150'); assert.deepEqual(optionIds(s), ['sweet']); s = draws(s, 'sweet'); assert.equal(hand(s).length, 2); assert.equal(s.players[0].pp, 4);
});
test('もちだ: attack keyword, departure count, exile on destruction; its surcharge offsets ぷぷりえーる discount', () => {
  let s = arena({ me: { hand: ['token_mochida', 's_24'] } }); const spell = hand(s)[1]; s.cards[spell].revealed = true; s = playFirst(s, 'token_mochida'); assert.equal(s.cards[spell].costDelta, 0); assert.ok(s.cards[field(s)[0]].keywords.includes('charge'));
  const uid = field(s)[0]; s = run(s, { type: 'adjust', actor: 0, uid, resource: 'damage', delta: 10 }, true); assert.ok(s.players[0].exile.includes(uid)); assert.equal(s.players[0].mochidaLeft, 1);
});
test('editor/snapshot: additional fruits, silence, hide duration, counters, history and Ex uses survive', () => {
  let s = arena({ me: { field: ['y_62'], hand: ['y_33'] } }); const uid = field(s)[0]; Object.assign(s.cards[uid], { hiding: false, evasion: 2, fruitTypes: ['orange'], silenced: true });
  Object.assign(s.players[0], { exSkills: { dice: { uses: 2 } }, ice: 4, acorns: 3, skillHistory: [1], mochidaLeft: 5 }); s.cards[hand(s)[0]].fruitTypes = ['melon'];
  const p = positionOf(s, catalog); const round = buildPosition(p, catalog); assert.deepEqual(positionOf(round, catalog), p); assert.deepEqual(fruitsOf(round, field(round)[0], catalog), ['grape', 'orange']);
  const saved = restoreGame(JSON.parse(JSON.stringify(s)), catalog); assert.ok(saved); assert.deepEqual(saved.players[0].exSkills, s.players[0].exSkills); assert.equal(saved.cards[uid].hiding, false);
});
test('editor: normalized turn numbers preserve Alice usage and next-turn strawberry restrictions', () => {
  let s = arena({ me: { field: ['y_9'] }, foe: { hand: ['y_37', 'y_9'] } }); s.turn = 70;
  s.players[0].exSkills = { alice: { uses: 1, lastTurn: 70 } }; s.players[1].strawberryOnlyUntil = 71;
  s = buildPosition(positionOf(s, catalog), catalog);
  assert.ok(!legalMoves(s, 0, catalog).some(m => m.command.type === 'exSkill' && m.command.skill === 'alice'));
  s = draws(end(s)); const grape = hand(s, 1).find(uid => s.cards[uid].cardId === 'y_37');
  assert.match(runError(s, { type: 'play', actor: 1, uid: grape }), /イチゴ狩り/);
  s = draws(end(s)); assert.ok(legalMoves(s, 0, catalog).some(m => m.command.type === 'exSkill' && m.command.skill === 'alice'));
});
