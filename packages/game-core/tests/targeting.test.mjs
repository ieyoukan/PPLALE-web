// Who can be chosen, for every way an effect selects a unit, with 0 / 1 / 2 / 3 enemy taunts.
// Rule (docs/card-effect-rules.md): an enemy taunt among the candidates narrows the choice to the
// taunts. Effects choosing on the own side are not affected, and 全体・ランダム effects never are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, choose, field, hand, optionIds, play, skill } from './helpers.mjs';

// いろは: taunt with 5 HP, so 4 damage does not remove it mid-test. ふらら: no taunt, 4 HP.
const TAUNT = 'y_29', PLAIN = 'y_23';
const enemies = taunts => [...Array(taunts).fill(TAUNT), PLAIN, PLAIN];
const tauntsOf = (s, side = 1) => field(s, side).filter(uid => s.cards[uid].keywords.includes('taunt'));
const tougher = s => { for (const uid of [...field(s), ...field(s, 1)]) s.cards[uid].hpBonus = 5; return s; };
const same = (actual, expected, message) => assert.deepEqual([...actual].sort(), [...expected].sort(), message);

const playOnly = (cards, foe) => { const s = arena({ me: { hand: cards }, foe: { field: foe } }); return play(s, hand(s)[0]); };

/** Ways to start choosing an enemy unit; each returns the state waiting for the choice. */
const enemyChoosers = {
  'ぷらむ（幼女の登場時）': foe => playOnly(['y_9'], foe),
  '猫カフェオレ（お菓子）': foe => playOnly(['s_6'], foe),
  'うぃまるのスキル': foe => skill(arena({ me: { playable: 'p_1' }, foe: { field: foe } }), 1),
  'レンテのうち来ない？': foe => skill(arena({ me: { playable: 'p_5', points: 9 }, foe: { field: foe } }), 1),
  'みゅーとん': foe => playOnly(['y_30'], foe),
  'しゅれい②（1人目）': foe => {
    const s = arena({ me: { hand: ['y_26'] }, foe: { field: foe } });
    return choose(play(s, hand(s)[0]), 'two');
  },
};

for (const [name, start] of Object.entries(enemyChoosers)) {
  test(`targeting: ${name} must pick an enemy taunt when there is one`, () => {
    for (const taunts of [0, 1, 2, 3]) {
      const s = start(enemies(taunts));
      same(optionIds(s), taunts ? tauntsOf(s) : field(s, 1), `${taunts} taunt(s)`);
    }
  });
}

test('targeting: しゅれい② with two taunts hits both taunts and nothing else', () => {
  let s = arena({ me: { hand: ['y_26'] }, foe: { field: enemies(2) } });
  s = choose(play(s, hand(s)[0]), 'two');
  const [first, second] = tauntsOf(s);
  s = choose(s, first);
  assert.deepEqual(optionIds(s), [second]);
  s = choose(s, second);
  assert.equal(s.pending, null);
  assert.deepEqual(field(s, 1).map(uid => s.cards[uid].damage), [4, 4, 0, 0]);
});

test('targeting: しゅれい② with three taunts lets the second hit go to any other taunt', () => {
  let s = arena({ me: { hand: ['y_26'] }, foe: { field: enemies(3) } });
  s = choose(play(s, hand(s)[0]), 'two');
  const [first, ...rest] = tauntsOf(s);
  s = choose(s, first);
  same(optionIds(s), rest);
  s = choose(s, rest[1]);
  assert.deepEqual(field(s, 1).map(uid => s.cards[uid].damage), [4, 0, 4, 0, 0]);
});

test('targeting: しゅれい② with one taunt hits only it, even when the first hit destroys it', () => {
  for (const taunt of [TAUNT, 'y_1']) {
    let s = arena({ me: { hand: ['y_26'] }, foe: { field: [taunt, PLAIN, PLAIN] } });
    s = choose(play(s, hand(s)[0]), 'two');
    s = choose(s, tauntsOf(s)[0]);
    assert.equal(s.pending, null, taunt);
    assert.ok(field(s, 1).filter(uid => s.cards[uid].cardId === PLAIN).every(uid => s.cards[uid].damage === 0), taunt);
  }
});

test('targeting: みゅーとん never chooses an own unit, with or without enemy taunts', () => {
  for (const taunts of [0, 1, 2]) {
    let s = arena({ me: { hand: ['y_30'], field: [PLAIN, TAUNT] }, foe: { field: enemies(taunts) } });
    s = play(s, hand(s)[0]);
    same(optionIds(s), taunts ? tauntsOf(s) : field(s, 1), `${taunts} taunt(s)`);
  }
});

/** Ways to start choosing an own unit; enemy and own taunts must not narrow them. */
const friendlyChoosers = {
  'さら': [{ hand: ['y_19'] }, s => play(s, hand(s)[0]), true],
  'にゃんこけーき': [{ hand: ['s_15'] }, s => play(s, hand(s)[0])],
  'でっかいシュークリーム': [{ hand: ['s_20'] }, s => play(s, hand(s)[0])],
  '共通スキル（突撃）': [{}, s => skill(s, 0)],
  'ドーナツ（捨てた後）': [{ hand: ['s_11', 's_12'] }, s => choose(play(s, hand(s)[0]), hand(s)[1])],
  'ポッキー（自分側）': [{ hand: ['s_23'] }, s => play(s, hand(s)[0])],
};

for (const [name, [me, start, excludesSelf]] of Object.entries(friendlyChoosers)) {
  test(`targeting: ${name} chooses any own unit, whatever taunts are out`, () => {
    for (const foe of [enemies(0), enemies(2)]) {
      let s = arena({ me: { ...me, field: [PLAIN, TAUNT, PLAIN] }, foe: { field: foe } });
      s = start(s);
      same(optionIds(s), field(s).filter(uid => !excludesSelf || s.cards[uid].cardId !== 'y_19'), `${foe.length - 2} enemy taunt(s)`);
    }
  });
}

test('targeting: ポッキー picks the enemy half under the same taunt rule', () => {
  for (const taunts of [0, 2]) {
    let s = arena({ me: { hand: ['s_23'], field: [PLAIN] }, foe: { field: enemies(taunts) } });
    s = choose(play(s, hand(s)[0]), field(s)[0]);
    same(optionIds(s), taunts ? tauntsOf(s) : field(s, 1), `${taunts} taunt(s)`);
  }
});

test('targeting: 全体 and ランダム effects ignore taunt', () => {
  let s = tougher(arena({ me: { hand: ['y_26'] }, foe: { field: enemies(2) } }));
  s = choose(play(s, hand(s)[0]), 'all');
  assert.deepEqual(field(s, 1).map(uid => s.cards[uid].damage), [2, 2, 2, 2]);
  // あみの (max PP 10 here) deals 2 to a random enemy: a non-taunt is hit for some seed.
  const hitPlain = [1, 2, 3, 4, 5, 6, 7, 8].some(seed => {
    let t = arena({ seed, me: { hand: ['y_12'] }, foe: { field: enemies(1) } });
    t = play(t, hand(t)[0]);
    return field(t, 1).some(uid => t.cards[uid].cardId === PLAIN && t.cards[uid].damage === 2);
  });
  assert.ok(hitPlain);
});
