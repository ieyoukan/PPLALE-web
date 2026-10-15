import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosition, canAttack, fruitsOf, positionOf, restoreGame, viewFor } from '../dist/index.js';
import { settle } from '../dist/core/zones.js';
import { arena, catalog, choose, draws, failure, field, hand, newest, optionIds, playFirst, run, skill, stats } from './helpers.mjs';

const end = s => draws(run(s, { type: 'end', actor: s.active }));
const attack = (s, uid, target) => run(s, { type: 'attack', actor: s.active, uid, target });

test('rule 6.1: 色おに blocks a melon source granting a timed fruit type', () => {
  let s = arena({ me: { hand: ['y_100'], field: ['y_74'] }, foe: { field: ['y_88', 'y_9'] } });
  const [immune, ordinary] = field(s, 1);
  s = playFirst(s, 'y_100');
  assert.equal(s.cards[immune].timedFruits, undefined);
  assert.deepEqual(fruitsOf(s, immune, catalog), ['melon']);
  assert.equal(s.cards[ordinary].timedFruits.strawberry, s.turn + 1);
});

test('rule 2: 色おに prevents a selected stat swap, including clearing damage', () => {
  let s = arena({ me: { hand: ['y_67'] }, foe: { field: ['y_88'] } });
  const target = field(s, 1)[0];
  s.cards[target].damage = 1;
  const before = stats(s, target);
  s = choose(playFirst(s, 'y_67'), target);
  assert.deepEqual(stats(s, target), before);
  assert.equal(s.cards[target].damage, 1);
});

test('rule 6.1: ぷらむ can randomly hit 色おに and its bounce then does nothing', () => {
  let s = arena({ me: { hand: ['y_93'], field: ['y_9'] }, foe: { field: ['y_88'] } });
  const own = field(s)[0], target = field(s, 1)[0];
  s = playFirst(s, 'y_93');
  assert.ok(hand(s).includes(own));
  assert.deepEqual(field(s, 1), [target]);
  assert.equal(s.players[1].hand.length, 0);
});

for (const first of ['amino', 'linne']) test(`rule 6.1: あみの and リンネ together, ${first} first`, () => {
  let s = arena({ me: { field: ['y_17'] }, foe: { field: ['y_17'], hand: ['y_91', 'y_33'], pp: 2 } });
  const attacker = field(s)[0], target = field(s, 1)[0], [amino, linne] = hand(s, 1);
  s = attack(s, attacker, target);
  assert.deepEqual(optionIds(s), ['skip', linne, amino]);
  if (first === 'linne') {
    s = choose(s, linne);
    assert.equal(s.cards[linne].revealed, true);
    assert.equal(s.cards[attacker].attackBonus, -1);
    assert.ok(optionIds(s).includes(amino));
  }
  s = choose(s, amino);
  assert.equal(s.pending, null);
  assert.equal(s.players[1].pp, 0);
  assert.ok(s.players[1].nap.includes(amino));
  assert.equal(s.cards[attacker].exhausted, true);
  assert.equal(s.cards[target].damage, 0);
  assert.ok(hand(s, 1).includes(linne));
});

test('rule 6.1: ぶらんちゃん lets its owner choose both payments and survives restore mid-choice', () => {
  let s = arena({ me: { hand: ['y_9'] }, foe: { hand: ['y_109', 'y_9', 's_19', 'y_17', 's_6'] } });
  const played = hand(s)[0], [bran, keep1, pay1, keep2, pay2] = hand(s, 1);
  s = choose(playFirst(s, 'y_9'), bran);
  assert.equal(optionIds(s).length, 4);
  s = choose(s, pay2);
  s = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  assert.ok(optionIds(s).includes(pay1));
  assert.ok(!optionIds(s).includes(pay2));
  const hidden = viewFor(s, 0).pending;
  assert.equal(hidden.prompt, '相手が選択しています');
  assert.deepEqual(hidden.options, []);
  assert.equal(hidden.task.ids, undefined);
  s = choose(s, pay1);
  assert.deepEqual(s.players[1].exile.sort(), [bran, pay1, pay2].sort());
  assert.deepEqual(hand(s, 1), [keep1, keep2]);
  assert.ok(s.players[0].nap.includes(played));
  assert.deepEqual(s.players[0].played, []);
  assert.equal(s.players[0].pp, 10);
});

test('rule 6.1: えーりん selects exactly four of six melon units, preserving the other two', () => {
  let s = arena({ me: { hand: ['y_78'], nap: Array(6).fill('y_65') }, foe: { points: 9 } });
  const nap = [...s.players[0].nap];
  s = choose(playFirst(s, 'y_78'), 'yes');
  const eirin = newest(s);
  s = choose(attack(s, eirin, 'leader'), 'yes');
  const chosen = [nap[5], nap[3], nap[1], nap[0]];
  for (const uid of chosen) {
    assert.ok(optionIds(s).includes(uid));
    s = choose(s, uid);
  }
  assert.deepEqual(s.players[0].exile.sort(), [...chosen].sort());
  assert.deepEqual(s.players[0].nap, [nap[2], nap[4]]);
  assert.deepEqual(stats(s, eirin), [3, 2]);
  assert.equal(s.cards[eirin].exhausted, false);
  assert.equal(s.pending, null);
});

for (const count of [0, 1, 2]) test(`rule 6.1: 氷花 with ${count} yojo cards still completes its two draws`, () => {
  let s = arena({ me: { hand: ['y_95'], yojo: ['y_9', 'y_17'] } });
  s.players[0].yojo = s.players[0].yojo.slice(0, count);
  const top = s.players[0].yojo[0];
  const sweetBefore = s.players[0].sweet.length;
  s = playFirst(s, 'y_95');
  if (count) {
    assert.deepEqual(optionIds(s).length, count);
    s = choose(s, top);
    assert.ok(s.players[0].nap.includes(top));
  }
  s = draws(s);
  assert.equal(hand(s).length, 2);
  assert.equal(s.players[0].sweet.length, sweetBefore - (count === 2 ? 1 : 2));
  assert.equal(s.pending, null);
});

for (const before of [5, 6]) test(`browser field limit: よみ entering a field of ${before} revives only available slots`, () => {
  let s = arena({ me: { hand: ['y_108'], field: Array(before).fill('y_9'), nap: ['y_9', 'y_17'] } });
  const [low, high] = s.players[0].nap;
  s = playFirst(s, 'y_108');
  if (before === 5) {
    assert.ok(optionIds(s).includes(low));
    s = choose(s, low);
    assert.ok(field(s).includes(low));
    assert.deepEqual(s.players[0].nap, [high]);
  } else assert.deepEqual(s.players[0].nap, [low, high]);
  assert.equal(field(s).length, 7);
  assert.equal(s.pending, null);
});

test('rule 6.1: もなか destruction decides defeat before simultaneous zero-point settlement', () => {
  for (const firstPlayer of [0, 1]) {
    const s = arena({ me: { field: ['y_106'] }, rules: { firstPlayer } });
    s.players.forEach(p => { p.points = 0; });
    s.cards[field(s)[0]].damage = 99;
    settle(s, catalog);
    assert.equal(s.winner, 1);
    assert.equal(s.winReason, 'defeat');
  }
});

test('current behavior: a stolen リマチャン grant expires at the new controller turn end', () => {
  let s = arena({ me: { hand: ['y_69'], field: ['y_9'] }, foe: { playable: 'p_5' } });
  const target = field(s)[0];
  s = choose(playFirst(s, 'y_69'), target);
  // Stage the opposing turn before endEffects: a normal turn end would already exile this unit.
  s.active = 1;
  s = choose(draws(skill(s, 1)), target);
  assert.ok(field(s, 1).includes(target));
  assert.deepEqual(stats(s, target), [5, 6]);
  assert.ok(s.cards[target].keywords.includes('exileAtEnd'));
  s = end(s);
  assert.ok(s.players[1].exile.includes(target));
  assert.ok(!s.players[0].exile.includes(target));
});

test('normal turn flow: リマチャン grant expires before the opposing レンテ can steal it', () => {
  let s = arena({ me: { hand: ['y_69'], field: ['y_9'] }, foe: { playable: 'p_5' } });
  const target = field(s)[0];
  s = choose(playFirst(s, 'y_69'), target);
  assert.ok(failure(s, { type: 'skill', actor: 1, index: 1 }));
  s = end(s);
  assert.ok(s.players[0].exile.includes(target));
  s = draws(skill(s, 1));
  assert.ok(!optionIds(s).includes(target));
});

test('rule 6.1: overlapping おにごっこ uses the strongest X through save, board code and zone reset', () => {
  let s = arena({ me: { hand: ['y_43', 'y_43', 'y_93'], field: ['y_49'], pp: 12 } });
  const unit = field(s)[0];
  s = choose(choose(playFirst(s, 'y_43'), '2'), unit);
  s = choose(choose(playFirst(s, 'y_43'), '0'), unit);
  assert.equal(s.cards[unit].evasion, 3);
  s = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  assert.equal(s.cards[unit].evasion, 3);
  const codeState = buildPosition(positionOf(s, catalog), catalog);
  assert.equal(codeState.cards[field(codeState)[0]].evasion, 3);
  s = playFirst(s, 'y_93');
  assert.ok(hand(s).includes(unit));
  assert.equal(s.cards[unit].evasion, 5);
});

test('rule 6.1: うぃまる uses attack X even when the remaining points are much smaller', () => {
  let s = arena({ me: { field: ['y_9'] }, foe: { hand: ['y_64'], points: 2 } });
  const attacker = field(s)[0], wimaru = hand(s, 1)[0];
  s.cards[attacker].attackBonus = 8;
  assert.equal(canAttack(s, 0, attacker, 'leader', catalog), true);
  s = choose(attack(s, attacker, 'leader'), wimaru);
  assert.equal(s.pending.task.count, 13);
  while (s.pending) s = choose(s, optionIds(s)[0]);
  assert.equal(s.players[1].exile.length, 13);
  assert.equal(s.players[1].points, 2);
  assert.equal(s.winner, null);
});

for (const cardId of ['y_83', 'y_84', 'token_mochida']) test(`destruction log names the real destination of ${cardId}`, () => {
  let s = arena({ me: { field: [cardId] } });
  const uid = field(s)[0];
  s = run(s, { type: 'adjust', actor: 0, resource: 'damage', uid, delta: 99 }, true);
  const ownLogs = s.log.filter(message => message.startsWith(`${catalog[cardId].name}が`));
  assert.equal(ownLogs.length, 1);
  assert.doesNotMatch(ownLogs[0], /お昼寝場所へ/);
  if (cardId === 'token_mochida') {
    assert.ok(s.players[0].exile.includes(uid));
    assert.match(ownLogs[0], /除外カードへ/);
  } else {
    assert.ok(s.players[0].yojo.includes(uid));
    assert.match(ownLogs[0], /幼女デッキへ戻りました/);
  }
});
