import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, catalog, choose, draws, failure, field, hand, idsOf, newest, optionIds, play, run, stats } from './helpers.mjs';

test('y_0 かがり: draws on the first turn, otherwise converts remaining PP into +X/+X', () => {
  let s = arena({ me: { hand: ['y_0'], turns: 1, pp: 1 } });
  s = play(s, hand(s)[0]);
  assert.equal(s.pending.task.op, 'draw');
  s = arena({ me: { hand: ['y_0'], pp: 5 } });
  s = play(s, hand(s)[0]);
  assert.deepEqual(stats(s, newest(s)), [5, 5]);
  assert.equal(s.players[0].pp, 0);
});

test('y_1 とここ: allies entering later get +1/-1, after their own on-play effects', () => {
  let s = arena({ me: { field: ['y_1'], hand: ['y_17'] } });
  s = play(s, hand(s)[0]);
  assert.deepEqual(stats(s, newest(s)), [4, 3]);
  // FAQ: ちょり draws (and gains 0/+2 from a sweet) before とここ's -1 applies.
  s = arena({ me: { field: ['y_1'], hand: ['y_8'] } });
  s = play(s, hand(s)[0]);
  s = draws(s, 'sweet');
  assert.equal(field(s).length, 2);
  assert.deepEqual(stats(s, newest(s)), [2, 2]);
});

test('y_2 うゆち: destruction chains into 少女 then 美女; five earlier うゆち give +3/+3 and fast', () => {
  let s = arena({ me: { field: ['y_2'] }, foe: { hand: ['y_9'] } });
  const target = field(s)[0];
  s.active = 1;
  s = play(s, hand(s, 1)[0]);
  s = choose(s, target);
  assert.deepEqual(idsOf(s, hand(s)), ['yt_0']);
  s = arena({ me: { hand: ['y_2'] } });
  s.players[0].played = ['y_2', 'y_2', 'yt_0', 'yt_1'];
  s = play(s, hand(s)[0]);
  assert.deepEqual(stats(s, newest(s)), [1, 1]);
  s = arena({ me: { hand: ['yt_1'] } });
  s.players[0].played = ['y_2', 'y_2', 'yt_0', 'yt_1', 'y_2'];
  s = play(s, hand(s)[0]);
  assert.deepEqual(stats(s, newest(s)), [6, 6]);
  assert.ok(s.cards[newest(s)].keywords.includes('fast'));
});

test('y_3 うぃまる: playing a real sweet grants a one-time damage barrier, back menus do not', () => {
  let s = arena({ me: { field: ['y_3'], hand: ['s_26', 's_19'] } });
  const wimaru = field(s)[0];
  s = play(s, hand(s)[0]);
  s = draws(s);
  while (s.pending) s = choose(s, s.pending.options[0].id);
  assert.equal(s.cards[wimaru].shield, false);
  s = play(s, hand(s).find(uid => s.cards[uid].cardId === 's_19'));
  assert.equal(s.cards[wimaru].shield, true);
});

test('y_4 えーりん / y_7 レンテ / y_10 ゼロオレ: destruction triggers', () => {
  let s = arena({ me: { hand: ['s_8'] }, foe: { field: ['y_4', 'y_7', 'y_10'] } });
  s.players[0].field = [];
  s = play(s, hand(s)[0]);
  assert.equal(s.pending.task.actor, 1);
  s = draws(s);
  assert.deepEqual(idsOf(s, field(s, 1)), ['token_cat']);
  assert.equal(hand(s, 1).length, 1);
});

test('y_5 かんらん: discards then draws, and a discarded かんらん draws again', () => {
  let s = arena({ me: { hand: ['y_5', 'y_5'], yojo: ['y_9', 'y_9'] } });
  s = play(s, hand(s)[0]);
  s = choose(s, hand(s)[0]);
  s = draws(s);
  assert.equal(s.players[0].nap.length, 1);
  assert.deepEqual(idsOf(s, hand(s)), ['y_9', 'y_9']);
});

test('y_6 ほーずき / y_8 ちょり: bonuses depend on which deck the draw came from', () => {
  for (const [id, deck, expected] of [['y_6', 'yojo', [2, 2]], ['y_6', 'sweet', [1, 2]], ['y_8', 'sweet', [1, 3]], ['y_8', 'yojo', [1, 1]]]) {
    let s = arena({ me: { hand: [id] } });
    s = draws(play(s, hand(s)[0]), deck);
    assert.deepEqual(stats(s, newest(s)), expected, `${id} ${deck}`);
  }
});

test('y_9 ぷらむ: targeted 2 damage is concentrated by taunt', () => {
  let s = arena({ me: { hand: ['y_9'] }, foe: { field: ['y_17', 'y_1'] } });
  s = play(s, hand(s)[0]);
  assert.deepEqual(optionIds(s), [field(s, 1)[1]]);
});

test('y_11 もなか: loses 2 points on play; on destruction damages allies and heals 2', () => {
  let s = arena({ me: { hand: ['y_11'], field: ['y_17'] } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].points, 10);
});

test('y_11 もなか: destruction damages every friendly unit and heals 2', () => {
  let s = arena({ me: { field: ['y_11', 'y_17'], points: 5 }, foe: { field: ['y_21'] } });
  s.active = 1;
  // まめろん has guard: grant pierce so the attack can reach もなか.
  s.cards[field(s, 1)[0]].keywords.push('pierce');
  s = run(s, { type: 'attack', actor: 1, uid: field(s, 1)[0], target: field(s)[0] });
  assert.equal(s.players[0].points, 7);
  assert.equal(s.cards[field(s)[0]].damage, 1);
});

test('y_12 あみの: +1 max PP; 7+ adds random damage, 10+ adds stealing 2', () => {
  let s = arena({ me: { hand: ['y_12'], ppBonus: 3 }, foe: { field: ['y_17'] } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].ppBonus, 4);
  assert.equal(s.cards[field(s, 1)[0]].damage, 0);
  s = arena({ me: { hand: ['y_12'] }, foe: { field: ['y_17'] } });
  s = play(s, hand(s)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
  assert.equal(s.players[1].points, 10);
});

test('y_13 がと: +X attack per がと in the own nap', () => {
  let s = arena({ me: { hand: ['y_13'], nap: ['y_13', 'y_13'] } });
  s = play(s, hand(s)[0]);
  assert.deepEqual(stats(s, newest(s)), [4, 1]);
});

test('y_14 ももか: takes the first manager / assistant manager from the top, revealed, then shuffles', () => {
  let s = arena({ me: { hand: ['y_14'], yojo: ['y_9', 'y_18', 'y_24'] } });
  const before = s.players[0].yojo.length;
  s = play(s, hand(s)[0]);
  assert.deepEqual(idsOf(s, hand(s)), ['y_18']);
  assert.equal(s.cards[hand(s)[0]].revealed, true);
  assert.equal(s.players[0].yojo.length, before - 1);
});

test('y_15 まこぽに / y_16 いのむー: cost 2 and +1/+1 for both when いのむー is present', () => {
  let s = arena({ me: { hand: ['y_15'], field: ['y_16'], pp: 2 } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].pp, 0);
  assert.deepEqual(stats(s, newest(s)), [3, 3]);
  assert.deepEqual(stats(s, field(s)[0]), [3, 4]);
});

test('y_15 まこぽに: a copy made by さら also gets +1/+1 while いのむー is present', () => {
  let s = arena({ me: { hand: ['y_15', 'y_19'], field: ['y_16'], pp: 6 } });
  s = play(s, hand(s)[0]);
  const original = newest(s);
  s = play(s, hand(s)[0]);
  s = choose(s, original);
  const copy = field(s).find(uid => s.cards[uid].cardId === 'y_15');
  assert.notEqual(copy, original);
  assert.deepEqual(stats(s, copy), [3, 3]);
  assert.deepEqual(stats(s, field(s)[0]), [4, 5]);
});

test('y_15 まこぽに: the bonus is fixed on entry; いのむー arriving or leaving later changes nothing', () => {
  let s = arena({ me: { hand: ['y_16'], field: ['y_15'] } });
  const makoponi = field(s)[0];
  s = play(s, hand(s)[0]);
  assert.deepEqual(stats(s, makoponi), [2, 2]);
  assert.deepEqual(stats(s, newest(s)), [2, 3]);
  s = arena({ me: { hand: ['y_15'], field: ['y_16'] } });
  s = play(s, hand(s)[0]);
  // いのむー leaves the field afterwards: まこぽに keeps its +1/+1.
  const inomu = field(s)[0];
  s.players[0].field = s.players[0].field.filter(uid => uid !== inomu);
  assert.deepEqual(stats(s, newest(s)), [3, 3]);
});

test('y_17 まめろん: cannot attack the sweets directly', () => {
  const s = arena({ me: { field: ['y_17'] } });
  assert.match(failure(s, { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' }), /攻撃/);
});

test('y_18 ぎってぃ: discards floor(d6/2) cards and scales its rewards with the discards', () => {
  const seen = new Set();
  for (let seed = 1; seed < 40 && seen.size < 4; seed++) {
    let s = arena({ seed, me: { hand: ['y_18', 'y_9', 'y_9', 'y_9'] }, foe: { hand: ['y_9', 'y_9', 'y_9'] } });
    s = play(s, hand(s)[0]);
    const x = Math.floor(Number(s.log.findLast(line => line.includes('ぎってぃのダイス')).match(/：(\d)/)[1]) / 2);
    seen.add(x);
    // The roll is recorded for this command, so the board can show the die.
    assert.deepEqual([s.effectRoll.revision, s.effectRoll.side, s.effectRoll.cardId, Math.floor(s.effectRoll.value / 2)], [s.revision, 0, 'y_18', x]);
    while (s.pending?.task.op === 'diceDiscard') s = choose(s, s.pending.options[0].id);
    s = draws(s);
    assert.equal(s.players[0].nap.length, x);
    assert.equal(hand(s, 1).length, x >= 1 ? 1 : 3);
    assert.equal(s.cards[newest(s)].keywords.includes('charge'), x >= 2);
    assert.equal(hand(s).length, x >= 3 ? 2 : 3 - x);
  }
  assert.ok(seen.size >= 3);
});

test('y_19 さら: destroys a chosen friendly unit and summons a same-name copy', () => {
  let s = arena({ me: { hand: ['y_19'], field: ['y_23'] } });
  const original = field(s)[0];
  s = play(s, hand(s)[0]);
  s = choose(s, original);
  assert.deepEqual(idsOf(s, field(s)), ['y_19', 'y_23']);
  assert.ok(s.players[0].nap.includes(original));
});

test('y_20 ふろんと: a direct attack eats 2 + attack; a barrier still counts as eating', () => {
  let s = arena({ me: { field: ['y_20'] } });
  s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' });
  assert.equal(s.players[1].points, 7);
  assert.equal(s.cards[field(s)[0]].ateOn, s.turn);
  s = arena({ me: { field: ['y_17'] } });
  s.cards[field(s)[0]].keywords = [];
  s.players[1].shield = true;
  s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' });
  assert.equal(s.players[1].points, 12);
  assert.equal(s.cards[field(s)[0]].ateOn, s.turn, 'FAQ: nullified points still count as eating');
});

test('y_21 しゅお: deals 3 before combat and heals 1; a defender killed by it does not hit back', () => {
  let s = arena({ me: { field: ['y_21'], points: 5 }, foe: { field: ['y_9'] } });
  s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: field(s, 1)[0] });
  assert.equal(s.players[0].points, 6);
  assert.equal(field(s, 1).length, 0);
  assert.equal(s.cards[field(s)[0]].damage, 0);
});

test('y_22 ゆうひ / y_23 ふらら: heal 2, ゆうひ also draws', () => {
  let s = arena({ me: { hand: ['y_22', 'y_23'], points: 5 } });
  s = draws(play(s, hand(s)[0]));
  s = play(s, hand(s).find(uid => s.cards[uid].cardId === 'y_23'));
  assert.equal(s.players[0].points, 9);
  assert.equal(hand(s).length, 1);
});

test('y_24 りくす: destroys units that ate last turn; with one or fewer it also restores 1 PP and 1 point', () => {
  let s = arena({ me: { hand: ['y_24'], points: 5, pp: 6 }, foe: { field: ['y_20', 'y_17'] } });
  s.cards[field(s, 1)[0]].ateOn = s.turn - 1;
  s = play(s, hand(s)[0]);
  assert.deepEqual(idsOf(s, field(s, 1)), ['y_17']);
  assert.equal(s.players[0].pp, 2);
  assert.equal(s.players[0].points, 6);
});

test('y_26 しゅれい: choose 2 to every enemy or 4 to two enemies', () => {
  let s = arena({ me: { hand: ['y_26'] }, foe: { field: ['y_23', 'y_23', 'y_23'] } });
  s = choose(play(s, hand(s)[0]), 'all');
  assert.deepEqual(field(s, 1).map(uid => s.cards[uid].damage), [2, 2, 2]);
  s = arena({ me: { hand: ['y_26'] }, foe: { field: ['y_23', 'y_23', 'y_23'] } });
  for (const uid of field(s, 1)) s.cards[uid].hpBonus = 5;
  s = choose(play(s, hand(s)[0]), 'two');
  s = choose(s, field(s, 1)[0]);
  assert.ok(!optionIds(s).includes(field(s, 1)[0]));
  s = choose(s, field(s, 1)[1]);
  assert.deepEqual(field(s, 1).map(uid => s.cards[uid].damage), [4, 4, 0]);
});

test('y_27 オフティ二: discard, heal 2, draw 2; two yojo draws restore 1 PP', () => {
  let s = arena({ me: { hand: ['y_27', 'y_9'], points: 5, pp: 6 } });
  s = play(s, hand(s)[0]);
  s = choose(s, hand(s)[0]);
  s = draws(s, 'yojo');
  assert.equal(s.players[0].points, 7);
  assert.equal(s.players[0].pp, 2);
  s = arena({ me: { hand: ['y_27'], pp: 6 } });
  s = draws(play(s, hand(s)[0]), ['yojo', 'sweet']);
  assert.equal(s.players[0].pp, 1, 'an empty hand skips only the discard');
});

test('y_28 じょんこ: immune to effect damage but not combat; copy effects still proceed (FAQ ②-1)', () => {
  let s = arena({ me: { hand: ['y_30'], field: ['y_21'] }, foe: { field: ['y_28'] } });
  s = choose(play(s, hand(s)[0]), field(s, 1)[0]);
  assert.deepEqual(idsOf(s, field(s, 1)), ['y_28']);
  assert.deepEqual(idsOf(s, field(s)), ['y_21', 'y_30', 'y_28']);
  s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: field(s, 1)[0] });
  assert.equal(s.cards[field(s, 1)[0]].damage, 4, 'しゅお: effect 3 is ignored, combat 4 lands');
});

test('y_29 いろは: swaps sweet points via damage and healing, capped at the maximum', () => {
  let s = arena({ me: { hand: ['y_29'], points: 4 }, foe: { points: 11 } });
  s = play(s, hand(s)[0]);
  assert.deepEqual(s.players.map(p => p.points), [11, 4]);
});

test('y_30 みゅーとん: may destroy an enemy and summons its copy on the own side', () => {
  let s = arena({ me: { hand: ['y_30'] }, foe: { field: ['y_23'] } });
  s = choose(play(s, hand(s)[0]), field(s, 1)[0]);
  assert.equal(field(s, 1).length, 0);
  assert.deepEqual(idsOf(s, field(s)), ['y_30', 'y_23']);
});

test('simultaneous destruction resolves the active side first', () => {
  let s = arena({ me: { field: ['y_4'] }, foe: { field: ['y_4'] } });
  s.active = 1;
  s = run(s, { type: 'attack', actor: 1, uid: field(s, 1)[0], target: field(s)[0] });
  assert.equal(s.pending.task.actor, 1);
});

test('y_19 さら chooses an own unit, y_30 みゅーとん an enemy one; neither the card itself', () => {
  for (const [id, side] of [['y_19', 0], ['y_30', 1]]) {
    let s = arena({ me: { hand: [id], field: ['y_23'] }, foe: { field: ['y_9'] } });
    const self = hand(s)[0];
    s = play(s, self);
    assert.deepEqual(optionIds(s), field(s, side).filter(uid => uid !== self), id);
  }
});

test('y_19 さら / y_30 みゅーとん: with nobody to choose, the unit just enters', () => {
  // さら needs another own unit, みゅーとん an enemy unit: the other side's units do not count.
  for (const [id, others] of [['y_19', { foe: { field: ['y_9'] } }], ['y_30', { me: { field: ['y_9'] } }], ['y_30', {}]]) {
    let s = arena({ ...others, me: { ...others.me, hand: [id] } });
    const before = [...field(s), ...field(s, 1)];
    s = play(s, hand(s)[0]);
    assert.equal(s.pending, null, id);
    assert.deepEqual(idsOf(s, field(s)).at(-1), id);
    assert.ok(before.every(uid => [...field(s), ...field(s, 1)].includes(uid)), `${id} destroyed nothing`);
  }
});

// Cost / attack / HP as printed on each strawberry card (read from the card images, not the sheet).
const printed = {
  y_0: [1, 1, 1], y_1: [1, 1, 1], y_2: [1, 1, 1], y_3: [2, 1, 3], y_4: [2, 2, 1], y_5: [2, 2, 1], y_6: [2, 1, 2], y_7: [2, 2, 2],
  y_8: [2, 1, 1], y_9: [2, 1, 2], y_10: [2, 2, 2], y_11: [2, 3, 3], y_12: [3, 1, 1], y_13: [3, 2, 1], y_14: [3, 2, 2], y_15: [3, 2, 2],
  y_16: [3, 2, 3], y_17: [3, 3, 4], y_18: [4, 3, 3], y_19: [4, 2, 3], y_20: [4, 3, 3], y_21: [4, 4, 2], y_22: [4, 2, 5], y_23: [4, 3, 4],
  y_24: [5, 3, 6], y_25: [5, 3, 3], y_26: [5, 2, 3], y_27: [5, 4, 4], y_28: [6, 5, 5], y_29: [7, 3, 5], y_30: [7, 3, 5],
};
test('printed stats: every strawberry unit matches its card', () => {
  for (const [id, stats] of Object.entries(printed)) assert.deepEqual([catalog[id].cost, catalog[id].attack, catalog[id].hp], stats, `${id} ${catalog[id].name}`);
});
