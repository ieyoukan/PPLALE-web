import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, applyCommand, restoreGame, cpuCommand, sandboxRules } from '../dist/index.js';

const data = name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url)))[name];
const catalog = Object.fromEntries([...data('yojo'), ...data('sweet'), ...data('playable'), ...data('tokenYojo')].map(card => [card.id, card]));
const deck = { name: 'テスト', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19'), playable: 'p_0' };
const create = (seed = 42, rules = {}) => newGame([deck, deck], catalog, { ...sandboxRules, ...rules }, seed);
function command(state, action, adjust = false) {
  const result = applyCommand(state, action, catalog, adjust);
  assert.equal(result.error, undefined);
  return result.state;
}
function roll(state) {
  for (let i = 0; i < 30 && state.phase === 'dice'; i++) state = command(state, { type: 'roll', actor: 0 });
  assert.equal(state.phase, 'opening');
  return state;
}
function deal(state) {
  while (state.phase === 'opening') {
    assert.equal(state.pending.task.op, 'draw');
    state = command(state, { type: 'choose', actor: state.pending.task.actor, option: state.pending.options[0].id });
  }
  return state;
}

test('starting a match waits for the dice and does not take any cards from either deck', () => {
  const state = create();
  assert.equal(state.phase, 'dice');
  assert.equal(state.turn, 0);
  assert.equal(state.pending, null);
  for (const player of state.players) {
    assert.equal(player.hand.length, 0);
    assert.equal(player.yojo.length, 20);
    assert.equal(player.sweet.length, 10);
    assert.equal(player.pp, 0);
  }
  assert.match(applyCommand(state, { type: 'end', actor: 0 }, catalog).error, /ダイス/);
  assert.equal(cpuCommand(state, catalog), null);
});

test('dice can tie, a tie needs a new roll, and the larger value decides the first player', () => {
  let tied;
  for (let seed = 0; seed < 500 && !tied; seed++) {
    const state = command(create(seed), { type: 'roll', actor: 0 });
    if (state.dice.rolls[0] === state.dice.rolls[1]) tied = state;
  }
  assert.ok(tied, 'both dice must be able to produce the same value');
  assert.equal(tied.phase, 'dice');
  assert.equal(tied.pending, null);
  assert.equal(tied.players[0].hand.length, 0);
  const decided = roll(tied);
  assert.equal(decided.rules.firstPlayer, decided.dice.rolls[0] > decided.dice.rolls[1] ? 0 : 1);
  assert.deepEqual(command(create(), { type: 'roll', actor: 0 }), command(create(), { type: 'roll', actor: 0 }));
});

test('each deck click draws exactly one opening card and only the requested player can draw', () => {
  const state = roll(create());
  const actor = state.pending.task.actor;
  const before = JSON.stringify(state);
  const denied = applyCommand(state, { type: 'choose', actor: actor === 0 ? 1 : 0, option: 'yojo' }, catalog);
  assert.ok(denied.error);
  assert.equal(JSON.stringify(state), before);
  assert.match(applyCommand(state, { type: 'end', actor }, catalog).error, /ダイス|ドロー/);
  const next = command(state, { type: 'choose', actor, option: 'yojo' });
  assert.equal(next.players[actor].hand.length, 1);
  assert.equal(next.players[actor].yojo.length, 19);
  assert.equal(next.pending.task.count, 2);
  const played = applyCommand(next, { type: 'play', actor, uid: next.players[actor].hand[0] }, catalog);
  assert.ok(played.error);
  const finished = deal(next);
  assert.equal(finished.phase, 'playing');
  assert.equal(finished.active, finished.rules.firstPlayer);
  assert.equal(finished.players[finished.active].pp, 1);
  assert.equal(finished.turn, 1);
  for (const player of finished.players) { assert.equal(player.hand.length, 3); assert.equal(player.yojo.length, 17); }
});

test('turn-start draws are explicit and block playing and ending until the deck is clicked', () => {
  const playing = deal(roll(create()));
  const next = command(playing, { type: 'end', actor: playing.active });
  assert.equal(next.pending.task.op, 'draw');
  assert.equal(next.pending.task.text, 'turn');
  assert.equal(next.players[next.active].hand.length, 3);
  assert.match(applyCommand(next, { type: 'end', actor: next.active }, catalog).error, /選択/);
  const drawn = command(next, { type: 'choose', actor: next.active, option: 'yojo' });
  assert.equal(drawn.pending, null);
  assert.equal(drawn.players[next.active].hand.length, 4);
  assert.equal(drawn.players[next.active].yojo.length, 16);
});

test('10 and 5 trigger separate manual sweet draws once each, including a single crossing of both', () => {
  let state = deal(roll(create()));
  state = command(state, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
  assert.deepEqual(state.players[0].milestones, [10, 5]);
  assert.equal(state.players[0].sweet.length, 10);
  assert.equal(state.pending.task.text, 'threshold');
  state = command(state, { type: 'choose', actor: 0, option: 'sweet' });
  assert.equal(state.players[0].sweet.length, 9);
  assert.equal(state.pending.task.text, 'threshold');
  state = command(state, { type: 'choose', actor: 0, option: 'sweet' });
  assert.equal(state.players[0].sweet.length, 8);
  assert.equal(state.pending, null);
  state = command(state, { type: 'adjust', actor: 0, resource: 'points', delta: 8 }, true);
  state = command(state, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
  assert.equal(state.pending, null);
  assert.equal(state.players[0].sweet.length, 8);
});

test('restoring a partially drawn opening retains the obligation and older matches retain their playing state', () => {
  let state = roll(create());
  state = command(state, { type: 'choose', actor: state.pending.task.actor, option: 'yojo' });
  const restored = restoreGame(JSON.parse(JSON.stringify(state)), catalog);
  assert.deepEqual(restored, JSON.parse(JSON.stringify(state)));
  assert.equal(restored.phase, 'opening');
  assert.equal(restored.pending.task.count, 2);
  const old = deal(restored);
  delete old.phase; delete old.dice;
  assert.equal(restoreGame(old, catalog).phase, 'playing');
});

test('CPU completes its required draws using the same commands as a human', () => {
  let state = roll(create());
  const actor = state.pending.task.actor;
  let draws = 0;
  while (state.pending && state.pending.task.actor === actor) {
    const action = cpuCommand(state, catalog);
    assert.equal(action.type, 'choose');
    state = command(state, action);
    draws++;
  }
  assert.equal(draws, 3);
  assert.equal(state.players[actor].hand.length, 3);
});
