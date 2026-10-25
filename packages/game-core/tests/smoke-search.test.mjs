import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, choose, field, hand, playFirst } from './helpers.mjs';

const withSmoke = (options, foe = {}) => {
  const state = arena({ me: options, foe });
  state.players[0].exSkills = { smoke: { uses: 0 } };
  return state;
};

test('魅惑の水煙: a searched sweet costs one point, but no card costs nothing', () => {
  let state = withSmoke({ hand: ['y_113'], sweet: ['s_6'] });
  const found = state.players[0].sweet[0];
  state = choose(playFirst(state, 'y_113'), found);
  assert.ok(hand(state).includes(found));
  assert.equal(state.players[0].points, 11);

  state = withSmoke({ hand: ['y_113'] });
  state = playFirst(state, 'y_113');
  assert.equal(state.players[0].points, 12);
});

test('魅惑の水煙: each card in a two-card search costs one point', () => {
  let state = withSmoke({ hand: ['y_137'], sweet: ['s_41', 's_42'] });
  const found = state.players[0].sweet.slice(0, 2);
  state = playFirst(state, 'y_137');
  state = choose(state, found[0]);
  assert.equal(state.players[0].points, 11);
  state = choose(state, found[1]);
  assert.equal(state.players[0].points, 10);
});

test('魅惑の水煙: ももかの自動サーチでも一点減る', () => {
  let state = withSmoke({ hand: ['y_14'], yojo: ['y_9', 'y_18'] });
  state = playFirst(state, 'y_14');
  assert.equal(state.players[0].points, 11);
  assert.equal(state.cards[hand(state)[0]].cardId, 'y_18');
});

test('魅惑の水煙: 山上から手札を選ぶ効果でも一点減る', () => {
  let state = withSmoke({ hand: ['y_128'], yojo: ['y_9', 'y_8', 'y_5', 'y_116'] });
  const found = state.players[0].yojo[0];
  state = choose(choose(playFirst(state, 'y_128'), found), 'hand');
  assert.ok(hand(state).includes(found));
  assert.equal(state.players[0].points, 11);
});

test('魅惑の水煙: フロートのサーチでも一点減る', () => {
  let state = withSmoke({ hand: ['s_9', 'y_9'], sweet: ['s_10'] }, { field: ['y_28'] });
  state = choose(playFirst(state, 's_9'), field(state, 1)[0]);
  state = choose(state, hand(state)[0]);
  const found = state.players[0].sweet.find(uid => state.cards[uid].cardId === 's_10');
  state = choose(state, found);
  assert.equal(state.players[0].points, 11);
});

test('魅惑の水煙: お昼寝場所から手札に戻す効果は数えない', () => {
  let state = withSmoke({ hand: ['y_46'], nap: ['y_9'] });
  const found = state.players[0].nap[0];
  state = choose(playFirst(state, 'y_46'), found);
  assert.ok(hand(state).includes(found));
  assert.equal(state.players[0].points, 12);
});
