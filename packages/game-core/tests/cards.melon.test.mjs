import test from 'node:test';
import assert from 'node:assert/strict';
import { canAttack, costOf, fruitsOf, playableView, positionOf, buildPosition, restoreGame, skillsFor, viewFor } from '../dist/index.js';
import { arena, catalog, choose, draws, failure, field, hand, idsOf, newest, optionIds, play, playFirst, run, skill, stats } from './helpers.mjs';

const end = s => run(s, { type: 'end', actor: s.active });
const attack = (s, target = field(s, 1)[0], uid = field(s)[0]) => run(s, { type: 'attack', actor: s.active, uid, target });
const kill = (s, uid) => run(s, { type: 'adjust', actor: 0, resource: 'damage', delta: 99, uid }, true);
const ofId = (s, uids, id) => uids.filter(uid => s.cards[uid].cardId === id);

test('y_65 みか: searches a うさぎ / ラビット card from either deck, then zeroes one in hand', () => {
  let s = arena({ me: { hand: ['y_65', 's_4'], sweet: ['s_16'] } });
  s = playFirst(s, 'y_65');
  assert.deepEqual(idsOf(s, optionIds(s)), ['s_16']);
  s = choose(s, optionIds(s)[0]);
  assert.deepEqual(idsOf(s, optionIds(s)).sort(), ['s_16', 's_4']);
  const soda = ofId(s, hand(s), 's_4')[0];
  s = choose(s, soda);
  assert.equal(s.cards[soda].revealed, true);
  assert.equal(costOf(s, soda, catalog, 0), 0);
  // Nothing to find and nothing in hand: no question.
  s = playFirst(arena({ me: { hand: ['y_65'] } }), 'y_65');
  assert.equal(s.pending, null);
});

test('y_66 さら: destroys another own unit, then draws one 幼女 and one お菓子; alone it does nothing', () => {
  let s = arena({ me: { hand: ['y_66'], field: ['y_9'] }, foe: { field: ['y_28'] } });
  const ally = field(s)[0];
  s = playFirst(s, 'y_66');
  assert.deepEqual(optionIds(s), [ally]);
  s = draws(choose(s, ally));
  assert.ok(s.players[0].nap.includes(ally));
  assert.deepEqual(hand(s).map(uid => catalog[s.cards[uid].cardId].type).sort(), ['sweet', 'yojo']);
  s = playFirst(arena({ me: { hand: ['y_66'] } }), 'y_66');
  assert.equal(s.pending, null);
  assert.equal(hand(s).length, 0);
});

test('y_67 ぎってぃ: swaps a unit\'s attack and HP; an enemy taunt concentrates the choice; 0 attack dies', () => {
  let s = arena({ me: { hand: ['y_67'], field: ['y_65'] }, foe: { field: ['y_28', 'y_9'] } });
  const taunt = field(s, 1)[0];
  s.cards[taunt].damage = 1;
  s = playFirst(s, 'y_67');
  assert.deepEqual(optionIds(s), [taunt]);
  s = choose(s, taunt);
  assert.deepEqual(stats(s, taunt), [4, 5]);
  assert.equal(s.cards[taunt].damage, 0);
  assert.equal(catalog[s.cards[taunt].cardId].hp + s.cards[taunt].hpBonus, 5);
  // Without a taunt any unit, own ones included: みか 0/1 becomes 1/0 and is destroyed.
  s = arena({ me: { hand: ['y_67'], field: ['y_65'] } });
  const mika = field(s)[0];
  s = playFirst(s, 'y_67');
  // The ぎってぃ just played cannot be chosen.
  assert.deepEqual(optionIds(s), [mika]);
  s = choose(s, mika);
  assert.ok(s.players[0].nap.includes(mika));
});

test('swapping damaged しゅお resets damage: later combat heals only new damage and restores the right PP', () => {
  let s = arena({ me: { hand: ['y_67'], field: ['y_105'], pp: 6 }, foe: { field: ['y_8'] } });
  const shuo = field(s)[0], defender = field(s, 1)[0];
  s.cards[shuo].damage = 2;
  s.cards[defender].attackBonus = 1;
  const [attackBefore, hpBefore] = stats(s, shuo);
  s = choose(playFirst(s, 'y_67'), shuo);
  assert.deepEqual(stats(s, shuo), [hpBefore, attackBefore]);
  assert.equal(s.cards[shuo].damage, 0);
  const ppBefore = s.players[0].pp;
  s = attack(s, defender, shuo);
  assert.ok(field(s).includes(shuo));
  assert.equal(s.cards[shuo].damage, 0);
  assert.deepEqual(stats(s, shuo), [hpBefore, attackBefore]);
  assert.equal(s.players[0].pp, ppBefore + 1);
});

test('y_68 みゅーとん: puts a same-named unit with all abilities lost; a full field gets nothing', () => {
  let s = arena({ me: { hand: ['y_68'], field: ['y_20'] } });
  s = choose(playFirst(s, 'y_68'), field(s)[0]);
  const copy = newest(s);
  assert.equal(s.cards[copy].cardId, 'y_20');
  assert.equal(s.cards[copy].silenced, true);
  assert.deepEqual(s.cards[copy].keywords, []);
  // A ふろんと without abilities eats no extra sweets.
  s = arena({ me: { hand: ['y_68'], field: ['y_9', 'y_9', 'y_9', 'y_9', 'y_9', 'y_9'] } });
  s = choose(playFirst(s, 'y_68'), field(s)[0]);
  assert.equal(field(s).length, 7);
});

test('y_69 リマチャン: +4/+4, 突撃, cannot eat, and leaves the game when its owner\'s turn ends', () => {
  let s = arena({ me: { hand: ['y_69'], field: ['y_9'] }, foe: { field: ['y_17'] } });
  const ally = field(s)[0];
  s = choose(playFirst(s, 'y_69'), ally);
  assert.deepEqual(stats(s, ally), [5, 6]);
  assert.ok(['charge', 'exileAtEnd', 'noEat'].every(k => s.cards[ally].keywords.includes(k)));
  assert.equal(canAttack(s, 0, ally, 'leader', catalog), false);
  s = end(s);
  assert.ok(s.players[0].exile.includes(ally));
  assert.deepEqual(s.cards[ally].keywords, []);
});

test('y_70 がと: on attack returns another own unit and grows by half its attack', () => {
  // ぷらむ (1/2) hits back for 1, so the grown がと (3/3) stays to be looked at.
  let s = arena({ me: { field: ['y_70', 'y_28'] }, foe: { field: ['y_9'] } });
  const [gato, jonko] = field(s);
  s = attack(s);
  assert.deepEqual(optionIds(s), [jonko]);
  s = choose(s, jonko);
  assert.ok(hand(s).includes(jonko));
  assert.equal(s.cards[gato].attackBonus, 2);
  // Alone, nothing is asked and it attacks as it is.
  s = attack(arena({ me: { field: ['y_70'] }, foe: { field: ['y_17'] } }));
  assert.equal(s.pending, null);
});

test('y_71 リンネ: draws, then may pay 2 sweet points for one more; asked even when it would lose or nothing is left to draw', () => {
  let s = draws(playFirst(arena({ me: { hand: ['y_71'] } }), 'y_71'));
  assert.deepEqual(optionIds(s), ['no', 'yes']);
  s = draws(choose(s, 'yes'));
  assert.equal(s.players[0].points, 10);
  // Two from リンネ, one for reaching 10 points.
  assert.equal(hand(s).length, 3);
  s = draws(playFirst(arena({ me: { hand: ['y_71'], points: 2 } }), 'y_71'));
  assert.deepEqual(optionIds(s), ['no', 'yes']);
  s = choose(s, 'yes');
  assert.equal(s.winner, 1);
  s = arena({ me: { hand: ['y_71'] } });
  s.players[0].yojo = []; s.players[0].sweet = [];
  s = playFirst(s, 'y_71');
  assert.deepEqual(optionIds(s), ['no', 'yes']);
});

test('y_72 うゆち: a cat on the field and a shown cat in hand, free with five 幼女 in the nap', () => {
  for (const n of [4, 5]) {
    const s = playFirst(arena({ me: { hand: ['y_72'], nap: Array(n).fill('y_9') } }), 'y_72');
    assert.deepEqual(idsOf(s, field(s)), ['y_72', 'token_cat']);
    const [cat] = hand(s);
    assert.equal(s.cards[cat].revealed, true);
    assert.equal(costOf(s, cat, catalog, 0), n >= 5 ? 0 : 1);
  }
  // With another shown cat already in hand, the player chooses which one becomes free.
  let s = arena({ me: { hand: ['y_72', 'token_cat'], nap: Array(5).fill('y_9') } });
  const old = ofId(s, hand(s), 'token_cat')[0];
  s.cards[old].revealed = true;
  s = playFirst(s, 'y_72');
  assert.equal(optionIds(s).length, 2);
  s = choose(s, old);
  assert.equal(costOf(s, old, catalog, 0), 0);
  assert.ok(ofId(s, hand(s), 'token_cat').some(uid => uid !== old && costOf(s, uid, catalog, 0) === 1));
});

test('y_73 ゆうひ: at its owner\'s turn end recovers 1 point and all PP, kept through the opponent\'s turn', () => {
  let s = arena({ me: { field: ['y_73'], points: 10, pp: 3 } });
  s = end(s);
  assert.equal(s.players[0].points, 11);
  assert.equal(s.players[0].pp, 10);
  assert.equal(s.active, 1);
});

test('y_74 ゼロオレンジ: cannot act until a レンス is on the field or shown; then acts at once; death destroys a random enemy', () => {
  let s = arena({ me: { hand: ['y_74', 'y_100'] }, foe: { field: ['y_9'] } });
  s = playFirst(s, 'y_74');
  const zero = newest(s);
  assert.equal(canAttack(s, 0, zero, field(s, 1)[0], catalog), false);
  s = choose(s, 'no');
  assert.equal(canAttack(s, 0, zero, 'leader', catalog), false);
  s = arena({ me: { hand: ['y_74', 'y_100'] }, foe: { field: ['y_9'] } });
  s = playFirst(s, 'y_74');
  const lens = ofId(s, hand(s), 'y_100')[0];
  s = choose(s, lens);
  assert.equal(canAttack(s, 0, newest(s), 'leader', catalog), true);
  // Judged only when it came: the レンス leaving the hand later does not stop it.
  s.players[0].hand = []; s.players[0].nap.push(lens);
  assert.equal(canAttack(s, 0, newest(s), 'leader', catalog), true);
  s = kill(s, newest(s));
  assert.equal(field(s, 1).length, 0);
  // Not shown when it came: a レンス shown later does not wake it.
  s = arena({ me: { hand: ['y_74', 'y_100'] }, foe: { field: ['y_9'] } });
  s = choose(playFirst(s, 'y_74'), 'no');
  s.cards[ofId(s, hand(s), 'y_100')[0]].revealed = true;
  assert.equal(canAttack(s, 0, newest(s), 'leader', catalog), false);
});

test('y_75 おうか: a cat and a もちだ into the hand', () => {
  const s = playFirst(arena({ me: { hand: ['y_75'] } }), 'y_75');
  assert.deepEqual(idsOf(s, hand(s)).sort(), ['token_cat', 'token_mochida']);
});

test('y_76 うぃまる: +1/+1 each time its owner\'s points recover, also at the maximum where nothing is added', () => {
  let s = arena({ me: { field: ['y_76'], hand: ['y_22', 'y_22'], points: 8 } });
  const wimaru = field(s)[0];
  s = draws(playFirst(s, 'y_22'));
  assert.deepEqual(stats(s, wimaru), [2, 3]);
  s.players[0].points = 12;
  s = draws(playFirst(s, 'y_22'));
  assert.equal(s.players[0].points, 12);
  assert.deepEqual(stats(s, wimaru), [3, 4]);
});

test('y_77 ちょり: 行動不能 until the next opponent turn ends; exiling four nap units exiles instead', () => {
  let s = arena({ me: { hand: ['y_77'] }, foe: { field: ['y_17'] } });
  const target = field(s, 1)[0];
  s = playFirst(s, 'y_77');
  assert.deepEqual(optionIds(s), [target]);
  s = choose(s, target);
  assert.equal(s.cards[target].immobileUntil, s.turn + 1);
  s = draws(end(s));
  assert.equal(canAttack(s, 1, target, 'leader', catalog), false);
  s = draws(end(s));
  assert.equal(s.cards[target].immobileUntil, undefined);

  // The target first, then whether to exile four, then (with more than four) which.
  s = arena({ me: { hand: ['y_77'], nap: Array(4).fill('y_9') }, foe: { field: ['y_17'] } });
  s = choose(playFirst(s, 'y_77'), field(s, 1)[0]);
  s = choose(s, 'yes');
  assert.equal(field(s, 1).length, 0);
  assert.equal(s.players[1].exile.length, 1);
  assert.equal(s.players[0].exile.length, 4);
  // Only a hidden enemy: nothing to choose, nothing asked.
  s = arena({ me: { hand: ['y_77'], nap: Array(4).fill('y_9') }, foe: { field: ['y_62'] } });
  s.cards[field(s, 1)[0]].hiding = true;
  s = playFirst(s, 'y_77');
  assert.equal(s.pending, null);
  assert.equal(s.players[0].exile.length, 0);
});

test('y_78 えーりん: 4 extra PP give 早食い and, after its attack, a second action for four melon units', () => {
  let s = arena({ me: { hand: ['y_78'], nap: ['y_65', 'y_65', 'y_65', 'y_65', 'y_9'] }, foe: { points: 9 } });
  s = playFirst(s, 'y_78');
  s = choose(s, 'yes');
  const eirin = newest(s);
  assert.equal(s.players[0].pp, 4);
  assert.ok(s.cards[eirin].keywords.includes('fast'));
  s = attack(s, 'leader', eirin);
  s = choose(s, 'yes');
  assert.equal(s.players[1].points, 7);
  assert.deepEqual(stats(s, eirin), [3, 2]);
  assert.equal(s.cards[eirin].exhausted, false);
  assert.equal(s.players[0].exile.length, 4);
  // Not enough PP: not asked.
  s = playFirst(arena({ me: { hand: ['y_78'], pp: 5 } }), 'y_78');
  assert.equal(s.pending, null);
});

test('えーりん does not offer encore when the defeated ゼロオレンジ destroys it', () => {
  let s = arena({ me: { field: ['y_78'], nap: Array(4).fill('y_65') }, foe: { field: ['y_74'] } });
  const eirin = field(s)[0], zero = field(s, 1)[0];
  Object.assign(s.cards[eirin], { attackBonus: 10, hpBonus: 10 });
  s.cards[eirin].keywords.push('encore');
  s = attack(s, zero, eirin);
  assert.ok(s.players[1].nap.includes(zero));
  assert.ok(s.players[0].nap.includes(eirin));
  assert.equal(s.pending, null);
  assert.equal(s.players[0].exile.length, 0);
});

test('えーりん waits for the defeated unit\'s death draw choice before offering encore', () => {
  let s = arena({ me: { field: ['y_78'], nap: Array(4).fill('y_65') }, foe: { field: ['y_4'] } });
  const eirin = field(s)[0];
  Object.assign(s.cards[eirin], { attackBonus: 10, hpBonus: 10 });
  s.cards[eirin].keywords.push('encore');
  s = attack(s);
  assert.equal(s.pending.task.op, 'draw');
  assert.equal(s.pending.task.actor, 1);
  assert.equal(s.players[0].exile.length, 0);
  s = draws(s);
  assert.equal(s.pending.task.actor, 0);
  assert.match(s.pending.prompt, /再行動/);
  s = choose(s, 'yes');
  assert.equal(s.players[0].exile.length, 4);
  assert.equal(s.cards[eirin].exhausted, false);
});

test('y_79 いろは: −7 then +4; at 7 or less the −7 loses the game; destroyed, +3', () => {
  let s = draws(playFirst(arena({ me: { hand: ['y_79'] } }), 'y_79'), 'sweet');
  assert.equal(s.players[0].points, 9);
  s = kill(s, newest(s));
  assert.equal(s.players[0].points, 12);
  s = playFirst(arena({ me: { hand: ['y_79'], points: 7 } }), 'y_79');
  assert.equal(s.winner, 1);
  assert.equal(s.players[0].points, 0);
});

test('y_80 キラチャン: exiles a hand card, then puts a chosen deck card into the nap; empty hand skips the first part', () => {
  let s = arena({ me: { hand: ['y_80', 'y_9'], yojo: ['y_106'] } });
  const card = ofId(s, hand(s), 'y_9')[0];
  s = choose(playFirst(s, 'y_80'), card);
  assert.ok(s.players[0].exile.includes(card));
  const deckCard = s.players[0].yojo[0];
  const before = s.players[0].yojo.filter(uid => uid !== deckCard);
  s = choose(s, deckCard);
  assert.ok(s.players[0].nap.includes(deckCard));
  // The deck it came from is shuffled.
  assert.deepEqual([...s.players[0].yojo].sort(), [...before].sort());
  assert.notDeepEqual(s.players[0].yojo, before);
  s = playFirst(arena({ me: { hand: ['y_80'] } }), 'y_80');
  assert.ok(optionIds(s).every(uid => s.players[0].yojo.includes(uid) || s.players[0].sweet.includes(uid)));
});

test('y_81 ここあ: a non-token 幼女 from hand back into the deck, a draw, then a cat', () => {
  let s = arena({ me: { hand: ['y_81', 'y_106', 'token_cat'] } });
  const unit = ofId(s, hand(s), 'y_106')[0];
  s = playFirst(s, 'y_81');
  assert.deepEqual(optionIds(s), [unit]);
  s = draws(choose(s, unit));
  assert.ok(s.players[0].yojo.includes(unit));
  assert.equal(ofId(s, hand(s), 'token_cat').length, 2);
  assert.equal(hand(s).length, 3);
});

test('y_82 なかよし: exiles the cats in the nap and adds as many to the hand', () => {
  const s = playFirst(arena({ me: { hand: ['y_82'], nap: ['token_cat', 'y_9', 'token_cat'] } }), 'y_82');
  assert.deepEqual(idsOf(s, s.players[0].nap), ['y_9']);
  assert.deepEqual(idsOf(s, hand(s)), ['token_cat', 'token_cat']);
});

test('y_83 いのむー: two shown もちだ; after ten left the field, every もちだ in hand +3/+3 and 早食い; destroyed, back into the deck', () => {
  let s = arena({ me: { hand: ['y_83', 'token_mochida'] } });
  s.players[0].mochidaLeft = 10;
  s = playFirst(s, 'y_83');
  const mochida = ofId(s, hand(s), 'token_mochida');
  assert.equal(mochida.length, 3);
  assert.ok(mochida.every(uid => stats(s, uid)[0] === 4 && s.cards[uid].keywords.includes('fast')));
  s = play(s, mochida[0]);
  assert.equal(canAttack(s, 0, mochida[0], 'leader', catalog), true);
  const inomu = field(s)[0], deck = s.players[0].yojo.length;
  s = kill(s, inomu);
  assert.ok(!s.players[0].nap.includes(inomu));
  assert.ok(s.players[0].yojo.includes(inomu));
  assert.equal(s.players[0].yojo.length, deck + 1);
  assert.deepEqual(stats(s, inomu), [1, 1]);
});

test('y_84 まこぽに: two もちだ, four after five left the field; destroyed, back into the deck', () => {
  for (const [left, count] of [[4, 2], [5, 4]]) {
    let s = arena({ me: { hand: ['y_84'] } });
    s.players[0].mochidaLeft = left;
    s = playFirst(s, 'y_84');
    assert.equal(ofId(s, hand(s), 'token_mochida').length, count);
    assert.ok(hand(s).every(uid => s.cards[uid].revealed));
    s = kill(s, field(s)[0]);
    assert.equal(s.players[0].nap.length, 0);
  }
});

test('y_85 ビデカメ: a deck without duplicates gives every unit that enters from now on +1/+1, once', () => {
  let s = arena({ me: { hand: ['y_85', 'y_85', 'y_9'], yojo: ['y_10', 'y_11'] } });
  s.players[0].yojo = s.players[0].yojo.slice(0, 2);
  s = playFirst(s, 'y_85');
  assert.deepEqual(stats(s, newest(s)), [2, 2]);
  assert.equal(s.players[0].entryBuff, 1);
  s = playFirst(s, 'y_85');
  assert.deepEqual(stats(s, newest(s)), [2, 2]);
  // With duplicates nothing happens.
  s = playFirst(arena({ me: { hand: ['y_85'] } }), 'y_85');
  assert.deepEqual(stats(s, newest(s)), [1, 1]);
  assert.equal(s.players[0].entryBuff, undefined);
});

test('y_86 しゅみあ: discard and draw twice; five 幼女 discarded this game hit a random enemy for 3', () => {
  let s = arena({ me: { hand: ['y_86', 'y_9', 'y_9'] }, foe: { field: ['y_17'] } });
  s.players[0].discardedYojo = 3;
  s = playFirst(s, 'y_86');
  s = draws(choose(s, hand(s)[0]));
  s = draws(choose(s, hand(s)[0]));
  assert.equal(s.players[0].discardedYojo, 5);
  assert.equal(s.cards[field(s, 1)[0]].damage, 3);
  // An empty hand still draws.
  s = draws(playFirst(arena({ me: { hand: ['y_86'] } }), 'y_86'));
  s = draws(choose(s, hand(s)[0]));
  assert.equal(hand(s).length, 1);
  assert.equal(s.players[0].nap.length, 1);
});

test('y_87 ぽめちゃん: destroyed, the opponent loses 1 point, 5 with 5 attack or more', () => {
  let s = arena({ me: { field: ['y_87'] } });
  s = kill(s, field(s)[0]);
  assert.equal(s.players[1].points, 11);
  s = arena({ me: { field: ['y_87'] } });
  s.cards[field(s)[0]].attackBonus = 4;
  s = kill(s, field(s)[0]);
  assert.equal(s.players[1].points, 7);
});

test('y_88 かがり: 色おに（メロン）; a random melon unit other than かがり, shown', () => {
  const s = playFirst(arena({ me: { hand: ['y_88'], yojo: ['y_88', 'y_65'] } }), 'y_88');
  assert.ok(s.cards[newest(s)].keywords.includes('colorMelon'));
  assert.deepEqual(idsOf(s, hand(s)), ['y_65']);
  assert.equal(s.cards[hand(s)[0]].revealed, true);
});

test('y_89 りんまる。: a cat into the nap, and every cat there becomes melon too', () => {
  const s = playFirst(arena({ me: { hand: ['y_89'], nap: ['token_cat'] } }), 'y_89');
  const cats = ofId(s, s.players[0].nap, 'token_cat');
  assert.equal(cats.length, 2);
  assert.ok(cats.every(uid => fruitsOf(s, uid, catalog).includes('melon')));
});

test('y_90 幸野粉白 / y_92 ほーずき: a random unit with HP / attack 4 or more, shown', () => {
  for (const [id, wanted] of [['y_90', 'y_22'], ['y_92', 'y_28']]) {
    const s = playFirst(arena({ me: { hand: [id], yojo: ['y_9', wanted] } }), id);
    assert.ok(idsOf(s, hand(s)).every(found => id === 'y_90' ? catalog[found].hp >= 4 : catalog[found].attack >= 4));
    assert.equal(hand(s).length, 1);
    assert.equal(s.cards[hand(s)[0]].revealed, true);
  }
});

test('y_91 あみの: attacking exiles two 幼女 from the enemy nap', () => {
  let s = arena({ me: { field: ['y_91'] }, foe: { field: ['y_17'], nap: ['y_9', 'y_10', 's_19', 'y_11'] } });
  s = attack(s);
  assert.equal(optionIds(s).length, 3);
  s = choose(s, optionIds(s)[0]);
  s = choose(s, optionIds(s)[0]);
  assert.equal(s.players[1].exile.length, 2);
  assert.deepEqual(idsOf(s, s.players[1].nap), ['s_19', 'y_11']);
});

test('y_91 あみの: from hand, 2 PP cancel an attack on its owner\'s unit; not for the sweets or without PP', () => {
  let s = arena({ me: { field: ['y_28'] }, foe: { field: ['y_17'], hand: ['y_91'], pp: 2 } });
  const [attacker] = field(s), [defender] = field(s, 1), [amino] = hand(s, 1);
  s = attack(s);
  assert.equal(s.pending.task.actor, 1);
  assert.doesNotMatch(JSON.stringify(viewFor(s, 0).pending), /あみの/);
  s = choose(s, amino);
  assert.equal(s.cards[defender].damage, 0);
  assert.equal(s.cards[attacker].damage, 0);
  assert.equal(s.cards[attacker].exhausted, true);
  assert.ok(s.players[1].nap.includes(amino));
  assert.equal(s.players[1].pp, 0);
  // The sweets: nothing to answer with.
  s = attack(arena({ me: { field: ['y_28'] }, foe: { hand: ['y_91'] } }), 'leader');
  assert.notEqual(s.pending?.task.op, 'attackResponses');
  assert.equal(s.players[1].points, 7);
  s = attack(arena({ me: { field: ['y_28'] }, foe: { field: ['y_17'], hand: ['y_91'], pp: 1 } }));
  assert.equal(s.pending, null);
  // Its owner keeps unspent PP into the opponent's turn while it is in hand.
  s = end(arena({ me: { hand: ['y_91'], pp: 5 } }));
  assert.equal(s.players[0].pp, 5);
});

test('y_93 ぷらむ: returns every other own unit, then as many random enemies', () => {
  let s = arena({ me: { hand: ['y_93'], field: ['y_9', 'y_10'] }, foe: { field: ['y_9', 'y_10', 'y_11'] } });
  s = playFirst(s, 'y_93');
  assert.deepEqual(idsOf(s, field(s)), ['y_93']);
  assert.equal(hand(s).length, 2);
  assert.equal(field(s, 1).length, 1);
  assert.equal(hand(s, 1).length, 2);
  s = playFirst(arena({ me: { hand: ['y_93'] }, foe: { field: ['y_9'] } }), 'y_93');
  assert.equal(field(s, 1).length, 1);
});

test('y_94 オフティ二: draws; destroyed, the strongest enemies cannot act for their owner\'s next three turns', () => {
  let s = draws(playFirst(arena({ me: { hand: ['y_94'] }, foe: { field: ['y_28', 'y_28', 'y_9'] } }), 'y_94'));
  assert.equal(hand(s).length, 1);
  const ofti = field(s)[0];
  assert.ok(s.cards[ofti].keywords.includes('evade'));
  assert.equal(s.cards[ofti].evasion, 6);
  s = kill(s, ofti);
  const [a, b, c] = field(s, 1);
  assert.equal(s.cards[a].immobileUntil, s.turn + 5);
  assert.equal(s.cards[b].immobileUntil, s.turn + 5);
  assert.equal(s.cards[c].immobileUntil, undefined);
  // Destroyed in the turn of the units' owner (it attacked オフティ二): that turn's end is the first of the three.
  s = arena({ me: { field: ['y_28'] }, foe: { field: ['y_94'] } });
  s = run(s, { type: 'adjust', actor: 1, resource: 'damage', delta: 99, uid: field(s, 1)[0] }, true);
  assert.equal(s.cards[field(s)[0]].immobileUntil, s.turn + 4);
});

test('y_95 氷花: of the top three, one to the nap and two back in the chosen order, then two draws', () => {
  let s = arena({ me: { hand: ['y_95'], yojo: ['y_9', 'y_10', 'y_11'] } });
  const [top, second, third] = s.players[0].yojo;
  s = playFirst(s, 'y_95');
  s = choose(s, second);
  assert.ok(s.players[0].nap.includes(second));
  s = choose(s, third);
  assert.deepEqual(s.players[0].yojo.slice(0, 2), [third, top]);
  s = draws(s);
  assert.deepEqual(hand(s), [third, top]);
});

test('y_96 ももか: on the field or in the nap, each recovery takes 1 from the opponent; two do not stack', () => {
  let s = arena({ me: { hand: ['y_22'], nap: ['y_96', 'y_96'], points: 8 } });
  s = draws(playFirst(s, 'y_22'));
  assert.equal(s.players[1].points, 11);
});

test('y_97 オズちゃんぽん: おにごっこ; the opponent reveals what they like, 1 PP per card left hidden', () => {
  let s = arena({ me: { hand: ['y_97'] }, foe: { hand: ['y_9', 'y_9', 'y_9'] } });
  s = playFirst(s, 'y_97');
  assert.equal(s.pending.task.actor, 1);
  s = choose(s, hand(s, 1)[0]);
  s = choose(s, 'done');
  assert.equal(s.cards[hand(s, 1)[0]].revealed, true);
  assert.equal(s.players[0].pp, 10 - 4 + 2);
  assert.ok(s.cards[newest(s)].keywords.includes('evade'));
});

test('y_98 ふろんとさん: swaps before attacking and acts twice a turn', () => {
  let s = arena({ me: { field: ['y_98'] }, foe: { field: ['y_8', 'y_8'] } });
  const uid = field(s)[0];
  s = attack(s, field(s, 1)[0]);
  assert.equal(s.cards[uid].exhausted, false);
  assert.deepEqual(stats(s, uid), [2, 3]);
  assert.equal(s.cards[uid].damage, 1);
  s = attack(s, field(s, 1)[0]);
  assert.equal(s.cards[uid].exhausted, true);
  assert.deepEqual(stats(s, uid), [3, 1]);
  assert.equal(s.cards[uid].damage, 1);
  assert.equal(catalog[s.cards[uid].cardId].hp + s.cards[uid].hpBonus, 2);
  assert.equal(field(s, 1).length, 0);
  assert.equal(canAttack(s, 0, uid, 'leader', catalog), false);
});

test('y_99 りくす: destroyed, two random own units +2/+2 and a shown お仕置き棒', () => {
  let s = arena({ me: { field: ['y_99', 'y_9', 'y_10'] } });
  const [rikusu, a, b] = field(s);
  s = kill(s, rikusu);
  assert.deepEqual(stats(s, a), [3, 4]);
  assert.deepEqual(stats(s, b), [4, 4]);
  assert.deepEqual(idsOf(s, hand(s)), ['token_stick']);
  assert.equal(s.cards[hand(s)[0]].revealed, true);
});

test('y_100 レンス: with ゼロオレンジ, 早食い and the enemies are strawberry until the next opponent turn ends', () => {
  let s = arena({ me: { hand: ['y_100'], field: ['y_10'] }, foe: { field: ['y_9'] } });
  const enemy = field(s, 1)[0];
  assert.deepEqual(fruitsOf(s, enemy, catalog), ['strawberry']);
  s.cards[enemy].fruitTypes = ['grape'];
  s = playFirst(s, 'y_100');
  const lens = newest(s);
  assert.ok(s.cards[lens].keywords.includes('fast'));
  assert.ok(fruitsOf(s, enemy, catalog).includes('strawberry'));
  s = draws(end(s));
  assert.ok(fruitsOf(s, enemy, catalog).includes('strawberry'));
  s = draws(end(s));
  assert.deepEqual(fruitsOf(s, enemy, catalog), ['strawberry', 'grape']);
  // Without ゼロオレンジ only 突撃.
  s = playFirst(arena({ me: { hand: ['y_100'] } }), 'y_100');
  assert.ok(!s.cards[newest(s)].keywords.includes('fast'));
});

test('y_101 ほとり丸: discards any number of cats, +X/+X and steals X; a taunt stops the steal', () => {
  let s = arena({ me: { hand: ['y_101', 'token_cat', 'token_cat'], points: 8 } });
  s = playFirst(s, 'y_101');
  s = choose(s, optionIds(s)[1]);
  s = choose(s, optionIds(s)[1]);
  assert.deepEqual(stats(s, newest(s)), [4, 4]);
  assert.deepEqual([s.players[0].points, s.players[1].points], [10, 10]);
  s = arena({ me: { hand: ['y_101', 'token_cat'] }, foe: { field: ['y_28'] } });
  const cat = ofId(s, hand(s), 'token_cat')[0];
  s = choose(playFirst(s, 'y_101'), cat);
  assert.deepEqual(stats(s, newest(s)), [3, 3]);
  assert.equal(s.players[1].points, 12);
});

test('y_102 しゅれい: −2/−2 to every enemy, or exile every enemy with 2 HP or less', () => {
  let s = arena({ me: { hand: ['y_102'] }, foe: { field: ['y_9', 'y_28'] } });
  s = choose(playFirst(s, 'y_102'), 'weaken');
  assert.equal(field(s, 1).length, 1);
  assert.deepEqual(stats(s, field(s, 1)[0]), [3, 3]);
  s = arena({ me: { hand: ['y_102'] }, foe: { field: ['y_9', 'y_28'] } });
  s = choose(playFirst(s, 'y_102'), 'exile');
  assert.equal(s.players[1].exile.length, 1);
  assert.deepEqual(idsOf(s, field(s, 1)), ['y_28']);
});

test('y_103 ちむどんどん: both hands except tokens go back into the decks, then both draw five', () => {
  let s = arena({ me: { hand: ['y_103', 'y_9', 'token_cat'] }, foe: { hand: ['y_9', 's_19'] } });
  const sweets = s.players[1].sweet.length;
  s = playFirst(s, 'y_103');
  s = draws(s);
  assert.equal(hand(s).length, 6);
  assert.equal(ofId(s, hand(s), 'token_cat').length, 1);
  assert.equal(hand(s, 1).length, 5);
  assert.equal(s.players[1].sweet.length + hand(s, 1).filter(uid => catalog[s.cards[uid].cardId].type === 'sweet').length, sweets + 1);
});

test('y_104 ストラ: 貫通 with five nap units; attacking with ten +3/+3, with fifteen also 3 PP', () => {
  let s = arena({ me: { hand: ['y_104'], nap: Array(15).fill('y_9'), pp: 5 }, foe: { field: ['y_17'] } });
  s = playFirst(s, 'y_104');
  const stra = newest(s);
  assert.ok(s.cards[stra].keywords.includes('pierce'));
  s = attack(s, field(s, 1)[0], stra);
  assert.equal(s.cards[stra].attackBonus, 3);
  assert.equal(s.players[0].pp, 3);
  s = playFirst(arena({ me: { hand: ['y_104'], nap: Array(4).fill('y_9') } }), 'y_104');
  assert.ok(!s.cards[newest(s)].keywords.includes('pierce'));
});

test('y_105 しゅお: surviving combat damage, attacking or attacked, heals fully and gives half as PP', () => {
  let s = arena({ me: { field: ['y_105'], pp: 2 }, foe: { field: ['y_11'] } });
  const shuo = field(s)[0];
  s.cards[shuo].damage = 1;
  s = attack(s);
  assert.equal(s.cards[shuo].damage, 0);
  assert.equal(s.players[0].pp, 4);
  // Destroyed by it: nothing.
  s = arena({ me: { field: ['y_28'], pp: 2 }, foe: { field: ['y_105'], pp: 0 } });
  const attacked = field(s, 1)[0];
  s = attack(s);
  assert.ok(s.players[1].nap.includes(attacked));
  assert.equal(s.players[1].pp, 0);
});

test('y_106 もなか: a one-time barrier, at most 3 damage a hit, no effect destruction, and its loss loses the game', () => {
  let s = arena({ me: { hand: ['y_106', 's_8', 's_8'] }, foe: { hand: ['y_106'] } });
  s = playFirst(s, 'y_106');
  const monaka = newest(s);
  assert.equal(s.cards[monaka].shield, true);
  assert.ok(s.cards[monaka].keywords.includes('destroyImmune'));
  s = arena({ me: { hand: ['s_8', 's_8'] }, foe: { field: ['y_106'] } });
  const theirs = field(s, 1)[0];
  s = playFirst(s, 's_8');
  assert.equal(s.cards[theirs].damage, 3);
  s.cards[theirs].damage = 6;
  s = playFirst(s, 's_8');
  assert.deepEqual([s.winner, s.winReason], [0, 'defeat']);
});

test('神隠し ようじょ贄: cards discarded together steal 2X at once, so one taunt-free steal (ほとり丸 with two cats steals 4 + 2)', () => {
  let s = arena({ me: { hand: ['y_101', 'token_cat', 'token_cat'], points: 4 } });
  s.players[0].exSkills = { kamikakushi: { uses: 1, lastTurn: s.turn } };
  s = playFirst(s, 'y_101');
  s = choose(s, optionIds(s)[1]);
  s = draws(choose(s, optionIds(s)[1]), 'sweet');
  // 2 × 2 cats from the ExSkill (one steal), then X = 2 from ほとり丸.
  assert.deepEqual([s.players[0].points, s.players[1].points], [10, 6]);
  assert.equal(s.log.filter(line => line.includes('お菓子ポイント 12 → 8')).length, 1);
});

test('y_107 かんらん: 神隠し ようじょ贄 — this turn each 幼女 discarded from hand steals 2; once a turn, twice a game', () => {
  let s = arena({ me: { hand: ['y_107', 'y_5', 'y_9'], points: 8 } });
  s = playFirst(s, 'y_107');
  assert.equal(s.players[0].exSkills.kamikakushi.uses, 2);
  s = run(s, { type: 'exSkill', actor: 0, skill: 'kamikakushi' });
  assert.ok(failure(s, { type: 'exSkill', actor: 0, skill: 'kamikakushi' }));
  s = playFirst(s, 'y_5');
  s = draws(choose(s, ofId(s, hand(s), 'y_9')[0]));
  assert.deepEqual([s.players[0].points, s.players[1].points], [10, 10]);
  // It survives a save.
  assert.equal(restoreGame(JSON.parse(JSON.stringify(s)), catalog).players[0].exSkills.kamikakushi.uses, 1);
});

test('y_108 よみ: 挑発・色おに（ぶどう）; a cost-2-or-less and a cost-4-or-less unit from the nap onto the field', () => {
  let s = arena({ me: { hand: ['y_108'], nap: ['y_65', 'y_77', 'y_94'] } });
  s = playFirst(s, 'y_108');
  assert.deepEqual(idsOf(s, optionIds(s)).sort(), ['y_65', 'y_77']);
  s = choose(s, ofId(s, optionIds(s), 'y_77')[0]);
  assert.deepEqual(idsOf(s, optionIds(s)).sort(), ['y_65', 'y_94']);
  s = choose(s, ofId(s, optionIds(s), 'y_94')[0]);
  assert.deepEqual(idsOf(s, field(s)), ['y_108', 'y_77', 'y_94']);
  assert.ok(['taunt', 'colorGrape'].every(k => s.cards[field(s)[0]].keywords.includes(k)));
});

test('y_109 ぶらんちゃん: answers a unit with an on-play effect; it goes to the nap unpaid and does nothing', () => {
  let s = arena({ me: { hand: ['y_9'] }, foe: { field: ['y_17'], hand: ['y_109', 'y_9', 's_19'] } });
  const played = hand(s)[0], bran = hand(s, 1)[0];
  s = playFirst(s, 'y_9');
  assert.equal(s.pending.task.op, 'playResponse');
  assert.doesNotMatch(JSON.stringify(viewFor(s, 0).pending), /ぶらんちゃん/);
  assert.equal(viewFor(s, 1).cards[played].cardId, 'y_9');
  s = choose(s, bran);
  assert.ok(s.players[0].nap.includes(played));
  assert.equal(s.players[0].pp, 10);
  assert.equal(s.players[1].exile.length, 3);
  assert.equal(s.cards[field(s, 1)[0]].damage, 0);
  // Declined: the play goes on.
  s = arena({ me: { hand: ['y_9'] }, foe: { field: ['y_17'], hand: ['y_109', 'y_9', 's_19'] } });
  s = choose(choose(playFirst(s, 'y_9'), 'skip'), field(s, 1)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
  // Two cards in hand are not enough; a unit without an on-play effect is not answered.
  s = playFirst(arena({ me: { hand: ['y_9'] }, foe: { field: ['y_17'], hand: ['y_109', 'y_9'] } }), 'y_9');
  assert.notEqual(s.pending.task.op, 'playResponse');
  s = playFirst(arena({ me: { hand: ['y_17'] }, foe: { hand: ['y_109', 'y_9', 'y_9'] } }), 'y_17');
  assert.equal(s.pending, null);
});

test('y_110 レンテ: takes one use of an enemy skill to use itself, and fills the field with tokens', () => {
  let s = arena({ me: { hand: ['y_110'], pp: 12, ppBonus: 10 }, foe: { playable: 'p_1', field: ['y_17'] } });
  s = playFirst(s, 'y_110');
  assert.deepEqual(idsOf(s, field(s)).sort(), ['token_cat', 'token_cat', 'token_mochida', 'token_mochida', 'token_mochida', 'token_pudding', 'y_110'].sort());
  s = choose(s, '2');
  assert.equal(s.players[1].skills[2], 1);
  assert.deepEqual(s.players[0].extraSkills, [{ playable: 'p_1', index: 2, uses: 1 }]);
  const index = skillsFor('p_0').length;
  assert.equal(playableView(s, 0, catalog).taken[0].index, index);
  s = choose(skill(s, index), field(s, 1)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
  assert.equal(s.players[0].extraSkills[0].uses, 0);
  assert.ok(failure(s, { type: 'skill', actor: 0, index }));
  // Carried by saves and board codes.
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(s)), catalog).players[0].extraSkills, s.players[0].extraSkills);
  assert.deepEqual(buildPosition(positionOf(s, catalog), catalog).players[0].extraSkills, s.players[0].extraSkills);
});

test('y_111 まめろん: 防衛・色おに（メロン）; hungry, cannot be destroyed by effects; 0/+2 attacking and attacked', () => {
  let s = playFirst(arena({ me: { hand: ['y_111'], points: 5 } }), 'y_111');
  assert.ok(s.cards[newest(s)].keywords.includes('destroyImmune'));
  s = playFirst(arena({ me: { hand: ['y_111'], points: 6 } }), 'y_111');
  assert.ok(!s.cards[newest(s)].keywords.includes('destroyImmune'));
  s = arena({ me: { field: ['y_111'] }, foe: { field: ['y_28'] } });
  s = attack(s);
  assert.deepEqual(stats(s, field(s)[0]), [6, 3]);
  s = arena({ me: { field: ['y_28'] }, foe: { field: ['y_111'] } });
  s = attack(s);
  assert.deepEqual(stats(s, field(s, 1)[0]), [6, 3]);
});

test('y_112 とここ: takes no damage attacking, and the excess over the HP it destroyed comes off the sweets', () => {
  let s = arena({ me: { field: ['y_112'] }, foe: { field: ['y_9'] } });
  s = attack(s);
  assert.equal(s.cards[field(s)[0]].damage, 0);
  assert.equal(s.players[1].points, 12 - (7 - 2));
  // Attacked, it takes damage as usual.
  s = arena({ me: { field: ['y_28'] }, foe: { field: ['y_112'] } });
  const tokoko = field(s, 1)[0];
  s = attack(s);
  assert.ok(s.players[1].nap.includes(tokoko));
});

test('melon state is copied, saved and shared: timed fruit types, actions, entry buff, discards', () => {
  let s = arena({ me: { field: ['y_98', 'y_10'], hand: ['y_100'] }, foe: { field: ['y_8', 'y_8'] } });
  s.players[0].entryBuff = 1;
  s.players[0].discardedYojo = 4;
  s = attack(s, field(s, 1)[0]);
  s = playFirst(s, 'y_100');
  const restored = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  for (const uid of Object.keys(s.cards)) for (const key of ['actions', 'timedFruits', 'immobileUntil']) assert.deepEqual(restored.cards[uid][key], s.cards[uid][key], `${uid}.${key}`);
  assert.equal(restored.players[0].entryBuff, 1);
  assert.equal(restored.players[0].discardedYojo, 4);
  const rebuilt = buildPosition(positionOf(s, catalog), catalog);
  assert.equal(rebuilt.players[0].entryBuff, 1);
  assert.equal(rebuilt.players[0].discardedYojo, 4);
  const front = rebuilt.players[0].field.find(uid => rebuilt.cards[uid].cardId === 'y_98');
  assert.equal(rebuilt.cards[front].actions, 1);
  const enemy = rebuilt.players[1].field[0];
  assert.ok(fruitsOf(rebuilt, enemy, catalog).includes('strawberry'));
});
