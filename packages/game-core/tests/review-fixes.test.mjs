// Regressions found by reviewing the grape / orange sets: each test is one of the reported bugs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, editGame, viewFor } from '../dist/index.js';
import { arena, catalog, choose, draws, failure, field, hand, idsOf, newest, optionIds, playFirst, run, skill, stats } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });
const attack = (s, target = field(s, 1)[0]) => run(s, { type: 'attack', actor: 0, uid: field(s)[0], target });

test('a unit back in hand is the printed card again: lost effects, given abilities and links are gone', () => {
  // りくす takes the effects of がと; ぷらむ returns it; played again its on-play effect works.
  let s = arena({ me: { hand: ['y_40', 'y_32', 'y_37'], field: ['y_37'], nap: Array(5).fill('y_9'), yojo: ['y_9'] } });
  const gato = field(s)[0];
  s = playFirst(s, 'y_40');
  assert.equal(s.cards[gato].silenced, true);
  s = choose(playFirst(s, 'y_32'), gato);
  assert.ok(hand(s).includes(gato));
  assert.ok(!s.cards[gato].silenced);
  s = draws(run(s, { type: 'play', actor: 0, uid: gato }));
  assert.deepEqual(stats(s, gato), [3, 3]);

  // おにごっこ given by ちょり does not come back to the hand with the unit.
  s = arena({ me: { hand: ['y_43', 'y_32'], field: ['y_8'] } });
  const chori = field(s)[0];
  s = choose(choose(playFirst(s, 'y_43'), '0'), chori);
  assert.ok(s.cards[chori].keywords.includes('evade'));
  s = choose(playFirst(s, 'y_32'), chori);
  assert.deepEqual(s.cards[chori].keywords, ['guard']);
  assert.equal(s.cards[chori].evasion, undefined);

  // ポッキー: the returned unit is no longer tied to its partner.
  s = arena({ me: { hand: ['s_23', 'y_32'], field: ['y_23'] }, foe: { field: ['y_17'] } });
  const mine = field(s)[0], theirs = field(s, 1)[0];
  s = choose(choose(playFirst(s, 's_23'), mine), theirs);
  assert.deepEqual(s.cards[theirs].links, [mine]);
  s = choose(playFirst(s, 'y_32'), mine);
  assert.deepEqual([s.cards[mine].links, s.cards[theirs].links], [[], []]);
});

test('lost effects end when the unit leaves the field: ちむどんどん！ in the nap is itself again', () => {
  let s = arena({ me: { hand: ['y_40'], field: ['y_146'] } });
  const chimu = field(s)[0];
  s = playFirst(s, 'y_40');
  s = run(s, { type: 'adjust', actor: 0, resource: 'damage', delta: 9, uid: chimu }, true);
  assert.ok(s.players[0].nap.includes(chimu));
  assert.ok(!s.cards[chimu].silenced);
});

test('y_34 とここ: hides only after the skill has resolved, and loses the ability at its next own turn', () => {
  // The opponent's skill (うぃまる: 1 damage to an enemy unit) can still choose とここ.
  let s = arena({ me: { playable: 'p_1' }, foe: { field: ['y_34'] } });
  const tokoko = field(s, 1)[0];
  s = skill(s, 1);
  assert.deepEqual(optionIds(s), [tokoko]);
  s = choose(s, tokoko);
  assert.ok(s.players[1].nap.includes(tokoko));

  // It survives a skill that does not hit it, is hidden until its owner's next turn, then has no かくれんぼ at all.
  s = arena({ me: { field: ['y_34'] } });
  const own = field(s)[0];
  s = choose(skill(s, 0), own);
  assert.equal(s.cards[own].hiding, true);
  s = draws(end(s));
  assert.equal(s.cards[own].hiding, true);
  s = draws(end(s));
  assert.equal(s.cards[own].hiding, false);
  assert.ok(!s.cards[own].keywords.includes('hide'));
});

test('y_42 うゆち: cannot bring itself back, and asks for 3 PP only when that adds a choice', () => {
  let s = playFirst(arena({ me: { hand: ['y_42'] } }), 'y_42');
  assert.equal(s.pending, null);
  assert.equal(field(s).length, 0);
  // A cost-2 unit in the nap: the extra payment would add nobody.
  s = playFirst(arena({ me: { hand: ['y_42'], nap: ['y_31'] } }), 'y_42');
  assert.deepEqual(idsOf(s, optionIds(s)), ['y_31']);
  // A cost-5 unit: paying is the only way.
  s = playFirst(arena({ me: { hand: ['y_42'], nap: ['y_58'] } }), 'y_42');
  assert.deepEqual(optionIds(s), ['no', 'yes']);
  s = choose(s, 'yes');
  assert.deepEqual(idsOf(s, optionIds(s)), ['y_58']);
});

test('y_35 えーりん attacks y_58 まめろん: the attacker\'s payment resolves before the defender\'s −2/−2', () => {
  let s = arena({ me: { field: ['y_35'] }, foe: { field: ['y_58'] } });
  const eirin = field(s)[0], mameron = field(s, 1)[0];
  s.cards[eirin].hpBonus = 1;
  s = attack(s);
  assert.deepEqual(optionIds(s), ['no', 'yes']);
  s = draws(choose(s, 'yes'));
  // 2/2 → +2/+1 = 4/3 → −2/−2 = 2/1: まめろん takes 2, えーりん dies to its 4 attack.
  assert.equal(s.cards[mameron].damage, 2);
  assert.ok(s.players[0].nap.includes(eirin));
  // Without the payment it is gone before it could be asked again or deal damage.
  s = arena({ me: { field: ['y_35'] }, foe: { field: ['y_58'] } });
  s = draws(choose(attack(s), 'no'));
  assert.equal(s.pending, null);
  assert.equal(s.cards[field(s, 1)[0]].damage, 0);
  assert.equal(s.players[0].points, 12);
});

test('y_125 ようかん: allies react to it entering before the turn ends', () => {
  let s = arena({ me: { hand: ['y_125'], field: ['y_1'] } });
  s = playFirst(s, 'y_125');
  const youkan = newest(s);
  while (s.active === 0 && s.pending?.task.actor === 0) s = choose(s, optionIds(s)[0]);
  assert.equal(s.active, 1);
  assert.deepEqual(stats(s, youkan), [3, 1]);
});

test('s_44 ぜんりょくおうえん☆ぷぷりえーる: discounted however it is revealed', () => {
  // あみのの参謀 reveals it (and takes 2 more off until the end of the turn).
  let s = arena({ me: { playable: 'p_0', hand: ['s_44'], nap: ['y_24', 'y_25', 'y_17'] } });
  const card = hand(s)[0];
  s = choose(skill(s, 1), card);
  assert.equal(s.cards[card].revealed, true);
  assert.equal(s.cards[card].costDelta, -3);
  assert.equal(costOf(s, card, catalog, 0), 5);
});

test('お仕置き棒 / おしおきなん！ need a unit that can actually be chosen', () => {
  // とここ ate last turn and then hid: nothing can be selected.
  let s = arena({ me: { playable: 'p_4', hand: ['token_stick'], pp: 2 }, foe: { field: ['y_34'] } });
  const tokoko = field(s, 1)[0];
  Object.assign(s.cards[tokoko], { ateOn: s.turn - 1, keywords: ['hide'], hiding: true });
  assert.ok(failure(s, { type: 'play', actor: 0, uid: hand(s)[0] }), 'お仕置き棒 cannot be played');
  assert.ok(failure(s, { type: 'skill', actor: 0, index: 2 }), 'おしおきなん！ cannot be used');
  // Once it shows itself again, both work.
  s.cards[tokoko].hiding = false;
  assert.equal(failure(s, { type: 'play', actor: 0, uid: hand(s)[0] }), undefined);
  assert.equal(failure(s, { type: 'skill', actor: 0, index: 2 }), undefined);
});

test('room view: a hand reaction does not tell the other player which card is held', () => {
  let s = arena({ me: { field: ['y_49'] }, foe: { field: ['y_8'], hand: ['y_33'] } });
  s = attack(s);
  assert.equal(s.pending.task.actor, 1);
  assert.match(s.pending.prompt, /リンネ/);
  assert.doesNotMatch(JSON.stringify(viewFor(s, 0).pending), /リンネ|発動/);
  assert.match(viewFor(s, 1).pending.prompt, /リンネ/);
});

test('editor: a かくれんぼ unit moved from hand to the field hides like one put there', () => {
  let s = arena({ me: { hand: ['y_114'] } });
  s = editGame(s, { type: 'toField', uid: hand(s)[0], slot: 0 }, catalog);
  assert.equal(s.cards[field(s)[0]].hiding, true);
});

test('nothing is asked for or spent when it could not do anything', () => {
  // ちょり with nobody to give おにごっこ to: no PP question.
  let s = playFirst(arena({ me: { hand: ['y_43'] } }), 'y_43');
  assert.equal(s.pending, null);
  assert.equal(s.players[0].pp, 10 - catalog.y_43.cost);

  // カップアイス (アイス+1) with no enemy to hit: none is spent, so it only grows.
  s = arena({ me: { hand: ['s_32'] } });
  s.players[0].ice = 4;
  s = playFirst(s, 's_32');
  assert.equal(s.pending, null);
  assert.equal(s.players[0].ice, 5);

  // ここあの献身 at the maximum: nothing recovers, so no use is spent; below it, +1.
  s = arena({ me: { hand: ['y_22', 'y_22'], yojo: ['y_9', 'y_9'] } });
  s.players[0].exSkills = { healing: { uses: 3 } };
  s = draws(playFirst(s, 'y_22'));
  assert.equal(s.players[0].exSkills.healing.uses, 3);
  s.players[0].points = 5;
  s = draws(playFirst(s, 'y_22'));
  assert.deepEqual([s.players[0].points, s.players[0].exSkills.healing.uses], [8, 2]);

  // どんぐり for PP at 12 PP is refused; the draw still works.
  s = arena({ me: { pp: 12, yojo: ['y_9'] } });
  s.players[0].acorns = 1;
  assert.ok(failure(s, { type: 'acorn', actor: 0, mode: 'pp' }));
  assert.equal(failure(s, { type: 'acorn', actor: 0, mode: 'draw' }), undefined);
});

test('y_145 ぶらんちゃん: only an enemy unit\'s attack on it triggers the point loss, not its own attack', () => {
  // It attacks ふらら (3 attack) while at 3 HP and dies to the damage taken back: nobody loses points.
  let s = arena({ me: { field: ['y_145'] }, foe: { field: ['y_23'] } });
  const bran = field(s)[0];
  s.cards[bran].damage = 2;
  s = draws(attack(s));
  assert.ok(s.players[0].nap.includes(bran));
  assert.deepEqual([s.players[0].points, s.players[1].points], [12, 12]);
});
