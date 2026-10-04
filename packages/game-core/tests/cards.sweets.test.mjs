import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, choose, draws, failure, field, hand, idsOf, optionIds, play, playFirst, run, stats } from './helpers.mjs';

test('s_0〜s_5 動物さんソーダ: X counts distinct sodas played including this one', () => {
  const cases = [
    [[], s => assert.equal(s.pending.task.op, 'draw')],
    [['s_1'], s => assert.equal(s.pending.task.op, 'damage')],
    [['s_1', 's_2'], s => assert.equal(s.players[1].points, 10)],
    [['s_1', 's_2', 's_3'], s => assert.equal(s.cards[field(s, 1)[0]].damage, 3)],
    [['s_1', 's_2', 's_3', 's_4'], s => assert.equal(s.pending.task.count, 3)],
    [['s_1', 's_2', 's_3', 's_4', 's_5'], s => assert.equal(s.players[1].points, 7)],
  ];
  for (const [played, check] of cases) {
    let s = arena({ me: { hand: ['s_0'] }, foe: { field: ['y_23'] } });
    s.players[0].played = played;
    check(play(s, hand(s)[0]));
  }
});

test('s_6 / s_7 / s_8 カフェ: each café bonus needs the partner played earlier', () => {
  let s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_23'] } });
  s.players[0].played = ['s_7'];
  s = choose(playFirst(s, 's_6'), field(s, 1)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 3);
  assert.equal(s.pending.task.op, 'draw');
  s = arena({ me: { hand: ['s_7'] }, foe: { field: ['y_23'] } });
  s.players[0].played = ['s_6'];
  s = choose(playFirst(s, 's_7'), field(s, 1)[0]);
  assert.equal(s.players[1].points, 11);
  s = arena({ me: { hand: ['s_8'] }, foe: { field: ['y_23', 'y_23'] } });
  s.players[0].played = ['s_6', 's_7'];
  s = draws(playFirst(s, 's_8'));
  assert.deepEqual(field(s, 1).map(uid => s.cards[uid].damage), [3, 3]);
  assert.equal(s.players[1].points, 10);
});

test('s_9 / s_10 フロート: partner upgrades the damage, the first float may exile a card to search', () => {
  let s = arena({ me: { hand: ['s_9', 'y_9'], sweet: ['s_10'] }, foe: { field: ['y_28', 'y_23'] } });
  s.cards[field(s, 1)[0]].keywords = [];
  s = choose(playFirst(s, 's_9'), field(s, 1)[1]);
  assert.equal(s.cards[field(s, 1)[1]].damage, 2);
  assert.ok(optionIds(s).includes('skip'));
  s = choose(s, hand(s)[0]);
  assert.equal(s.players[0].exile.length, 1);
  s = choose(s, s.pending.options[0].id);
  assert.deepEqual(idsOf(s, hand(s)), ['s_10']);
  s = playFirst(s, 's_10');
  assert.equal(s.pending, null, 'second float: hits everyone, no search');
  assert.deepEqual(idsOf(s, field(s, 1)), ['y_28']);
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
  s = arena({ me: { hand: ['s_9'] }, foe: { field: ['y_28'] } });
  Object.assign(s.cards[field(s, 1)[0]], { keywords: [], hpBonus: 10 });
  s.players[0].played = ['s_10'];
  s = choose(playFirst(s, 's_9'), field(s, 1)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 6);
});

test('s_11〜s_14 ドーナツ: discarding another doughnut grants the keyword, otherwise nothing', () => {
  for (const [id, keyword] of [['s_11', 'pierce'], ['s_12', 'taunt'], ['s_13', 'guard'], ['s_14', 'fast']]) {
    let s = arena({ me: { hand: [id, 's_11'], field: ['y_9'] } });
    s = play(s, hand(s)[0]);
    s = choose(s, hand(s)[0]);
    s = choose(s, field(s)[0]);
    assert.ok(s.cards[field(s)[0]].keywords.includes(keyword), id);
  }
  let s = arena({ me: { hand: ['s_11'], field: ['y_9'] } });
  s = play(s, hand(s)[0]);
  assert.equal(s.pending, null);
  assert.deepEqual(s.cards[field(s)[0]].keywords, []);
});

test('s_15 / s_16 / s_17 ケーキ: the three-kind bonus includes this card', () => {
  let s = arena({ me: { hand: ['s_15'], field: ['y_9'] } });
  s.players[0].played = ['s_16', 's_17'];
  s = choose(play(s, hand(s)[0]), field(s)[0]);
  assert.deepEqual(stats(s, field(s)[0]), [2, 3]);
  assert.equal(s.pending.task.count, 2);
  s = arena({ me: { hand: ['s_16'], field: ['y_9'] } });
  s.players[0].played = ['s_15', 's_17'];
  s = choose(play(s, hand(s)[0]), field(s)[0]);
  assert.deepEqual(stats(s, field(s)[0]), [4, 5]);
  s = arena({ me: { hand: ['s_17'], field: ['y_9', 'y_9'] } });
  s.players[0].played = ['s_15', 's_16'];
  s = play(s, hand(s)[0]);
  assert.deepEqual(field(s).map(uid => stats(s, uid)), [[2, 3], [2, 3]]);
});

test('s_18 いちごパフェ: each yojo draw reduces the opponent, each sweet draw heals', () => {
  let s = arena({ me: { hand: ['s_18'], points: 5 } });
  s = draws(play(s, hand(s)[0]), ['yojo', 'sweet']);
  assert.equal(s.players[1].points, 11);
  assert.equal(s.players[0].points, 6);
});

test('s_19 ふわふわパンケーキ: heal 3 and a barrier that stops one steal, not reductions or taunt-blocked steals', () => {
  let s = arena({ me: { hand: ['s_19'], points: 5 }, foe: { hand: ['s_22', 's_22'], pp: 20 } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].points, 8);
  assert.equal(s.players[0].shield, true);
  s.active = 1;
  s = playFirst(s, 's_22');
  assert.equal(s.players[0].points, 8);
  assert.equal(s.players[0].shield, false);
  s = playFirst(s, 's_22');
  assert.equal(s.players[0].points, 1);
  s = arena({ me: { field: ['y_1'] }, foe: { hand: ['s_22'] } });
  s.players[0].shield = true;
  s.active = 1;
  s = play(s, hand(s, 1)[0]);
  assert.equal(s.players[0].shield, true);
  assert.equal(s.players[0].points, 12);
});

test('s_20 でっかいシュークリーム: +4/+4 and guard, without duplicating an existing guard', () => {
  let s = arena({ me: { hand: ['s_20'], field: ['y_3'] } });
  s = choose(play(s, hand(s)[0]), field(s)[0]);
  assert.deepEqual(stats(s, field(s)[0]), [5, 7]);
  assert.deepEqual(s.cards[field(s)[0]].keywords, ['guard']);
});

test('s_21 ぷるぷるギガプリン: summons a taunt / guard / immobile pudding and heals 2', () => {
  let s = arena({ me: { hand: ['s_21'], points: 5 } });
  s = play(s, hand(s)[0]);
  assert.deepEqual(idsOf(s, field(s)), ['token_pudding']);
  assert.deepEqual(s.cards[field(s)[0]].keywords, ['taunt', 'guard', 'immobile']);
  assert.equal(s.players[0].points, 7);
});

test('s_23 くっつくポッキー: linked units are destroyed together', () => {
  let s = arena({ me: { hand: ['s_23', 'y_9'], field: ['y_23'] }, foe: { field: ['y_9'] } });
  s = choose(playFirst(s, 's_23'), field(s)[0]);
  s = choose(s, field(s, 1)[0]);
  s = choose(playFirst(s, 'y_9'), field(s, 1)[0]);
  assert.equal(field(s, 1).length, 0);
  assert.deepEqual(idsOf(s, field(s)), ['y_9']);
});

test('s_24 ぷぷりえーる: revealed copies get cheaper per yojo played; it buffs all allies with fast', () => {
  let s = arena({ me: { hand: ['s_24', 'y_9', 'y_9'], field: ['y_23'] } });
  const menu = hand(s)[0];
  s = run(s, { type: 'reveal', actor: 0, uid: menu });
  s = playFirst(playFirst(s, 'y_9'), 'y_9');
  assert.equal(s.cards[menu].costDelta, -2);
  s.players[0].pp = 10;
  s = play(s, menu);
  assert.ok(field(s).every(uid => s.cards[uid].keywords.includes('fast')));
  assert.deepEqual(stats(s, field(s)[0]), [4, 5]);
});

test('s_25 おいしくなる呪文: doubles the next non-soda sweet and stacks additively (two casts = ×3)', () => {
  let s = arena({ me: { hand: ['s_25', 's_6'] }, foe: { field: ['y_28'] } });
  Object.assign(s.cards[field(s, 1)[0]], { keywords: [], hpBonus: 10 });
  s = choose(playFirst(playFirst(s, 's_25'), 's_6'), field(s, 1)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 6);
  s = arena({ me: { hand: ['s_25', 's_25', 's_0', 's_6'] }, foe: { field: ['y_28'] } });
  Object.assign(s.cards[field(s, 1)[0]], { keywords: [], hpBonus: 10 });
  s.players[0].pp = 20;
  s = playFirst(playFirst(s, 's_25'), 's_25');
  s = draws(playFirst(s, 's_0'));
  assert.equal(hand(s).length, 2, 'sodas are not multiplied and do not consume the boost');
  s = choose(playFirst(s, 's_6'), field(s, 1)[0]);
  assert.equal(s.cards[field(s, 1)[0]].damage, 9);
});

test('s_26 おうたあそび: draws, then reveals a sweet in hand and lowers its cost by 1', () => {
  let s = arena({ me: { hand: ['s_26', 's_22'] } });
  s = draws(play(s, hand(s)[0]));
  const target = hand(s).find(uid => s.cards[uid].cardId === 's_22');
  s = choose(s, target);
  assert.equal(s.cards[target].revealed, true);
  assert.equal(s.cards[target].costDelta, -1);
});

test('s_27 すいーつあーん: gives a revealed copy to the opponent and restores 2 PP, even with no sweet to give', () => {
  let s = arena({ me: { hand: ['s_27', 's_6'], pp: 3 } });
  s = play(s, hand(s)[0]);
  s = choose(s, hand(s)[0]);
  assert.equal(s.players[0].exile.length, 1);
  assert.deepEqual(idsOf(s, hand(s, 1)), ['s_6']);
  assert.equal(s.cards[hand(s, 1)[0]].revealed, true);
  assert.equal(s.players[0].pp, 5);
  s = arena({ me: { hand: ['s_27'], pp: 3 } });
  s = play(s, hand(s)[0]);
  assert.equal(s.players[0].pp, 5);
});

test('single-target damage sweets cannot be played without an enemy unit', () => {
  const blocked = (cardId, played = []) => {
    const s = arena({ me: { hand: [cardId] } });
    s.players[0].played = played;
    return !!failure(s, { type: 'play', actor: 0, uid: hand(s)[0] });
  };
  assert.ok(blocked('s_6'));
  assert.ok(blocked('s_7'));
  assert.ok(blocked('s_9'));
  assert.ok(blocked('s_9', ['s_10']));
  assert.ok(blocked('s_10'));
  // 動物さんソーダ: only X=2 selects a unit.
  assert.ok(blocked('s_0', ['s_1']));
  assert.ok(!blocked('s_0'));
  // Area damage needs no target.
  assert.ok(!blocked('s_8'));
  assert.ok(!blocked('s_0', ['s_1', 's_2', 's_3']));
  // The card stays in hand and no PP is spent.
  const s = arena({ me: { hand: ['s_6'] } });
  const after = failure(s, { type: 'play', actor: 0, uid: hand(s)[0] });
  assert.match(after, /対象/);
});

test('sweets that select one of your own units cannot be played on an empty field', () => {
  const blocked = (cardId, { played = [], extra = [], foe = {} } = {}) => {
    const s = arena({ me: { hand: [cardId, ...extra] }, foe });
    s.players[0].played = played;
    return !!failure(s, { type: 'play', actor: 0, uid: hand(s)[0] });
  };
  for (const id of ['s_11', 's_12', 's_13', 's_14']) assert.ok(blocked(id, { extra: ['s_11'] }));
  for (const id of ['s_15', 's_16', 's_17', 's_20']) assert.ok(blocked(id));
  assert.ok(blocked('s_16', { played: ['s_15', 's_17'] }));
  // くまちょこけーき as the third kind buffs everyone and selects nothing.
  assert.ok(!blocked('s_17', { played: ['s_15', 's_16'] }));
  // ポッキー needs a unit on both sides.
  assert.ok(blocked('s_23', { foe: { field: ['y_9'] } }));
  // ぷぷりえーる buffs all and stays playable.
  const s = arena({ me: { hand: ['s_24'], pp: 12 } });
  assert.equal(failure(s, { type: 'play', actor: 0, uid: hand(s)[0] }), undefined);
});

test('s_10 メロンソーダフロート: once コーラフロート was played it hits all and needs no enemy unit', () => {
  let s = arena({ me: { hand: ['s_10'] } });
  s.players[0].played = ['s_9'];
  s = playFirst(s, 's_10');
  assert.equal(s.pending, null);
  assert.deepEqual(idsOf(s, hand(s)), []);
});
