import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosition, decodePosition, editGame, encodePosition, positionOf, restoreGame, uyuchiPlayCount, viewFor } from '../dist/index.js';
import { arena, catalog, choose, field, hand, newest, play, stats } from './helpers.mjs';

const count = (s, side = 0) => uyuchiPlayCount(s.players[side], catalog);

test('うゆち・少女・美女はそれぞれ1回。場に置いただけのカードや別プレイヤーは混ぜない', () => {
  let s = arena({ me: { field: ['y_2'], hand: ['y_2', 'yt_0', 'yt_1'] } });
  assert.equal(count(s), 0);
  for (let n = 1; n <= 3; n++) {
    s = play(s, hand(s)[0]);
    assert.equal(count(s), n);
    assert.equal(count(s, 1), 0);
  }
});

test('レンスでイチゴになったメロンうゆちも履歴に残り、6枚目の強化に数える', () => {
  let s = arena({ me: { hand: ['y_60', 'y_72', 'y_2'] } });
  const melon = hand(s)[1];
  s.players[0].played = Array(4).fill('y_2');
  s = play(s, hand(s)[0]);
  s = choose(choose(s, melon), 'done');
  assert.ok(s.cards[melon].fruitTypes.includes('strawberry'));
  s = play(s, melon);
  assert.equal(count(s), 5);
  assert.equal(s.players[0].extraUyuchiPlays, 1);
  s = play(s, hand(s)[0]);
  assert.equal(count(s), 6);
  assert.deepEqual(stats(s, newest(s)), [4, 4]);
  assert.ok(s.cards[newest(s)].keywords.includes('fast'));
});

test('ソーダによるタイプ付与とHP0のうゆちも、手札を離れる前のタイプで数える', () => {
  let s = arena({ me: { hand: ['y_42'] } });
  s.players[0].lastingFruits = ['strawberry'];
  s = play(s, hand(s)[0]);
  while (s.pending) s = choose(s, s.pending.options[0].id);
  assert.equal(count(s), 1);
  assert.equal(field(s).length, 0);
  for (const restored of [restoreGame(JSON.parse(JSON.stringify(s)), catalog), buildPosition(decodePosition(encodePosition(positionOf(s, catalog))), catalog), viewFor(s, 1)]) {
    assert.ok(restored);
    assert.equal(count(restored), 1);
  }
  const edited = editGame(s, { type: 'played', side: 0, cardIds: ['y_2'] }, catalog);
  assert.equal(count(edited), 1);
});

test('イチゴを付けていない別タイプと、ぶらんちゃんに止められたプレイは数えない', () => {
  let s = arena({ me: { hand: ['y_72'] } });
  s = play(s, hand(s)[0]);
  assert.equal(count(s), 0);
  s = arena({ me: { hand: ['y_2'] }, foe: { hand: ['y_109', 'y_9', 's_19'] } });
  const bran = hand(s, 1)[0];
  s = play(s, hand(s)[0]);
  assert.equal(count(s), 0);
  s = choose(s, bran);
  assert.equal(count(s), 0);
});
