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
  // The opponent's skill (うぃまる: 1 damage to an enemy unit) chooses とここ: it does not hide for that.
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

test('y_42 うゆち: cannot bring itself back; the extra 3 PP is always offered (「してもよい」)', () => {
  // Nothing in the nap: still asked whether to pay, and nothing comes back.
  let s = playFirst(arena({ me: { hand: ['y_42'] } }), 'y_42');
  assert.deepEqual(optionIds(s), ['no', 'yes']);
  s = choose(s, 'no');
  assert.equal(s.pending, null);
  assert.equal(field(s).length, 0);
  // A cost-5 unit: only with the payment.
  s = playFirst(arena({ me: { hand: ['y_42'], nap: ['y_58'] } }), 'y_42');
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

test('「してもよい」 is always asked, even when it would do nothing; automatic Exスキル and PP increases (user rulings)', () => {
  // ちょり with nobody to give おにごっこ to: the PP question still comes.
  let s = playFirst(arena({ me: { hand: ['y_43'] } }), 'y_43');
  assert.equal(s.pending.task.actor, 0);
  assert.ok(optionIds(s).includes('0'));

  // カップアイス with no enemy: still asked how much アイス to use.
  s = arena({ me: { hand: ['s_32'] } });
  s.players[0].ice = 4;
  s = playFirst(s, 's_32');
  assert.ok(optionIds(s).includes('0'));

  // ここあの献身 is automatic: used by a recovery at the maximum too.
  s = arena({ me: { hand: ['y_22'], yojo: ['y_9'] } });
  s.players[0].exSkills = { healing: { uses: 3 } };
  s = draws(playFirst(s, 'y_22'));
  assert.equal(s.players[0].exSkills.healing.uses, 2);

  // どんぐり 「使用できるPPを1増やす」 goes past 12; its draw is not a card effect (魅惑の水煙 ignores it).
  s = arena({ me: { pp: 12, yojo: ['y_9'] } });
  s.players[0].acorns = 2;
  s.players[0].exSkills = { smoke: { uses: 0 } };
  s = run(s, { type: 'acorn', actor: 0, mode: 'pp' });
  assert.equal(s.players[0].pp, 13);
  s = draws(run(s, { type: 'acorn', actor: 0, mode: 'draw' }));
  assert.equal(s.players[0].points, 12);
});

test('「PPを回復する」 stops at the 最大PP and gets ダブルダガー; 「PPを増やす」 goes past it without it', () => {
  // りくす (5 PP): ppを1回復 when no one ate. 最大PP 10, PP 13 → 8 after paying → +1 +2 (ダブルダガー) = 11, stopped at 10.
  let s = arena({ me: { hand: ['y_24'], pp: 13 } });
  s.players[0].exSkills = { dagger: { uses: 1 } };
  s = playFirst(s, 'y_24');
  assert.equal(s.players[0].pp, 10);
  // Above the 最大PP already (after どんぐり): a recovery adds nothing, and takes nothing away.
  s = arena({ me: { hand: ['y_24'], pp: 17 } });
  s = playFirst(s, 'y_24');
  assert.equal(s.players[0].pp, 12);
  // ストラの前借り (使用できるPPを2増やす) from 10 → 12, past nothing yet; again from 12 it would be 14.
  s = arena({ me: { playable: 'p_2', pp: 12 } });
  s.players[0].exSkills = { dagger: { uses: 1 } };
  s = skill(s, 1);
  assert.equal(s.players[0].pp, 14);
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

test('every way a match ends records why (the result screen reads it)', async () => {
  const { decideMatch, restoreGame, winReasonOf } = await import('../dist/index.js');
  // お菓子ポイントが0。
  let s = arena({ me: { field: ['y_25'] }, foe: { points: 1 } });
  s = run(s, { type: 'attack', actor: 0, uid: field(s)[0], target: 'leader' });
  assert.deepEqual([s.winner, s.winReason], [0, 'points']);
  // The reason survives saving, and the first decision stands.
  const saved = restoreGame(JSON.parse(JSON.stringify(s)), catalog);
  assert.equal(saved.winReason, 'points');
  decideMatch(saved, 1, 'resign');
  assert.deepEqual([saved.winner, saved.winReason], [0, 'points']);
  // A save from before reasons were recorded: read from the points.
  delete saved.winReason;
  assert.equal(winReasonOf(saved), 'points');
  saved.players[1].points = 3;
  assert.equal(winReasonOf(saved), 'stall');
});

test('後攻5ターン目の+2PPは「最大PP」に数える（あみのの条件）', () => {
  // The second player's fifth turn: 5 + 2 = 7 最大PP, so あみの's 「既に7以上」 and her skill's condition hold.
  const fifth = () => {
    const s = arena({ rules: { firstPlayer: 1 }, me: { playable: 'p_0', hand: ['y_12'], turns: 5, ppBonus: 0, pp: 7 }, foe: { field: ['y_23'] } });
    s.players[0].turnPpBonus = 2;
    return s;
  };
  let s = playFirst(fifth(), 'y_12');
  assert.equal(s.cards[field(s, 1)[0]].damage, 2);
  assert.equal(failure(fifth(), { type: 'skill', actor: 0, index: 2 }), undefined);
  // Without the +2 (any other turn at 5 最大PP) neither applies.
  const plain = arena({ me: { playable: 'p_0', hand: ['y_12'], turns: 5, ppBonus: 0, pp: 5 }, foe: { field: ['y_23'] } });
  assert.equal(playFirst(plain, 'y_12').cards[field(plain, 1)[0]].damage, 0);
  assert.ok(failure(plain, { type: 'skill', actor: 0, index: 2 }));
});

test('トークンは幼女として数える: ちむどんどん！の「コスト1〜10の幼女」に猫まんじゅう（コスト1）が入る', () => {
  // One unit of each cost 2–9, a 猫まんじゅう for cost 1, and ちむどんどん！ itself (10 while in the nap).
  const ofCost = n => Object.values(catalog).find(c => c.type === 'yojo' && c.cost === n && c.id !== 'y_146' && /^y_/.test(c.id)).id;
  const nap = ['token_cat', ...[2, 3, 4, 5, 6, 7, 8, 9].map(ofCost), 'y_146'];
  const s = playFirst(arena({ me: { hand: ['y_146'], nap } }), 'y_146');
  assert.deepEqual([s.winner, s.winReason], [0, 'special']);
});

test('ぶどうのちょり: a unit that already has おにごっこ keeps the stronger one (the lower X)', () => {
  // ≧6 already; paying 2 gives ≧3: it becomes ≧3. Then ≧5 (no payment) does not weaken it.
  let s = arena({ me: { hand: ['y_43', 'y_43'], field: ['y_8'], pp: 12 } });
  const unit = field(s)[0];
  Object.assign(s.cards[unit], { keywords: ['guard', 'evade'], evasion: 6 });
  s = choose(choose(playFirst(s, 'y_43'), '2'), unit);
  assert.equal(s.cards[unit].evasion, 3);
  s = choose(choose(playFirst(s, 'y_43'), '0'), unit);
  assert.equal(s.cards[unit].evasion, 3);
});

test('オレンジのほとり丸: a trade is simultaneous, so it never sees the unit it traded with; its 2 damage to all does count', () => {
  // On its own turn and on the opponent's: ほとり丸 (5/3) and ちょり (1/1 guard) with 3 attack… a 3/3 that trades.
  for (const active of [0, 1]) {
    let s = arena({ me: { field: ['y_147'] }, foe: { field: ['y_23'] } });
    const hotori = field(s)[0], other = field(s, 1)[0];
    s.cards[other].hpBonus = 1; // ふらら 3/5: the 2 damage of the attack leaves it at 3, then they trade (5 vs 3 HP, 3 vs 3 HP).
    if (active === 1) {
      Object.assign(s, { active: 1 });
      s = run(s, { type: 'attack', actor: 1, uid: other, target: hotori });
    } else s = run(s, { type: 'attack', actor: 0, uid: hotori, target: other });
    s = draws(s);
    assert.ok(s.players[0].nap.includes(hotori) && s.players[1].nap.includes(other), `both destroyed (turn of ${active})`);
    assert.equal(s.players[1].points, 12, `no reduction on the turn of ${active}`);
  }
});

test('the stall rule: Exスキル and skills without a use limit are not actions', () => {
  // しゅれい's ルナレストア (no use limit) every turn, nothing else to do: the match still ends on points.
  let s = arena({ me: { playable: 'p_6', points: 9, yojo: [], sweet: [] }, foe: { points: 8, yojo: [], sweet: [] } });
  for (const side of [0, 1]) Object.assign(s.players[side], { yojo: [], sweet: [], hand: [] });
  for (let turn = 0; turn < 6 && s.winner === null; turn++) {
    if (s.active === 0 && s.players[0].pp >= 1) s = skill(s, 1);
    s = draws(run(s, { type: 'end', actor: s.active }));
  }
  assert.deepEqual([s.winner, s.winReason], [0, 'stall']);
});

test('ぶどうのまこぽに: not another ぶどうのまこぽに, but a いちごのまこぽに made grape by ソーダ (lasting) yes', () => {
  let s = arena({ me: { hand: ['y_45'], yojo: ['y_45', 'y_15'] } });
  const strawberry = s.players[0].yojo[1];
  s.cards[strawberry].lastingFruits = ['grape'];
  s = playFirst(s, 'y_45');
  assert.deepEqual(idsOf(s, hand(s)), ['y_15']);
  // The type from ソーダ is 「このゲーム中」: it stays after moving.
  assert.deepEqual(s.cards[strawberry].lastingFruits, ['grape']);
});

test('an attack brought to 0 by リンネ still counts as eating, with no change for うぃまる to stop', () => {
  let s = arena({ me: { field: ['y_9'] }, foe: { hand: ['y_33', 'y_64'], points: 5 } });
  const attacker = field(s)[0], linne = hand(s, 1)[0];
  s.cards[attacker].attackBonus = 1 - stats(s, attacker)[0];
  s = choose(attack(s, 'leader'), linne);
  if (s.pending?.task.op === 'attackResponses') s = choose(s, 'skip');
  assert.equal(s.pending, null);
  assert.equal(stats(s, attacker)[0], 0);
  assert.equal(s.cards[attacker].ateOn, s.turn);
  assert.equal(s.players[1].points, 5);
});
