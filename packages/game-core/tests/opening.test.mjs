import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, applyCommand, restoreGame, cpuCommand, canAttack, sandboxRules } from '../dist/index.js';

const data = name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url)))[name];
const catalog = Object.fromEntries([...data('yojo'), ...data('sweet'), ...data('playable'), ...data('tokenYojo'), ...data('token')].map(card => [card.id, card]));
const deck = { name: 'テスト', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19'), playable: 'p_0' };
const create = (seed = 42, rules = {}) => newGame([deck, deck], catalog, { ...sandboxRules, ...rules }, seed);
function command(state, action, adjust = false) {
  const result = applyCommand(state, action, catalog, adjust);
  assert.equal(result.error, undefined);
  return result.state;
}
function roll(state) {
  for (let i = 0; i < 30 && state.phase === 'dice'; i++) state = command(state, { type: 'roll', actor: state.dice?.rolls[0] !== null && state.dice?.rolls[1] === null ? 1 : 0 });
  if (state.phase === 'initiative') state = command(state, { type: 'initiative', actor: state.active, order: 'first' });
  assert.equal(state.phase, 'opening');
  return state;
}
function deal(state, drawFirst = true) {
  while (state.phase === 'opening') {
    const actor = state.openingRemaining.findIndex(count => count > 0);
    state = command(state, { type: 'openingDraw', actor, deck: 'yojo' });
  }
  while (state.phase === 'mulligan') state = command(state, { type: 'keep', actor: state.active });
  if (drawFirst && state.pending?.task.text === 'turn') state = command(state, { type: 'choose', actor: state.active, option: 'yojo' });
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

test('dice can tie, a tie needs a new roll, and the larger value earns the order choice', () => {
  let tied;
  for (let seed = 0; seed < 500 && !tied; seed++) {
    const first = command(create(seed), { type: 'roll', actor: 0 });
    const state = command(first, { type: 'roll', actor: 1 });
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

test('each deck click draws one opening card and both players draw independently', () => {
  const state = roll(create());
  const actor = state.rules.firstPlayer;
  const before = JSON.stringify(state);
  const enemy = actor === 0 ? 1 : 0;
  const independent = command(state, { type: 'openingDraw', actor: enemy, deck: 'sweet' });
  assert.equal(independent.players[enemy].hand.length, 1);
  assert.equal(independent.openingRemaining[actor], 3);
  assert.equal(JSON.stringify(state), before);
  assert.match(applyCommand(state, { type: 'end', actor }, catalog).error, /ダイス|ドロー/);
  const next = command(state, { type: 'openingDraw', actor, deck: 'yojo' });
  assert.equal(next.players[actor].hand.length, 1);
  assert.equal(next.players[actor].yojo.length, 19);
  assert.equal(next.openingRemaining[actor], 2);
  assert.equal(next.pending, null);
  const played = applyCommand(next, { type: 'play', actor, uid: next.players[actor].hand[0] }, catalog);
  assert.ok(played.error);
  const finished = deal(next, false);
  assert.equal(finished.phase, 'playing');
  assert.equal(finished.active, finished.rules.firstPlayer);
  assert.equal(finished.players[finished.active].pp, 1);
  assert.equal(finished.turn, 1);
  for (const side of [0, 1]) { const count = side === finished.rules.firstPlayer ? 3 : 4; assert.equal(finished.players[side].hand.length, count); assert.equal(finished.players[side].yojo.length, 20 - count); }
});

test('turn-start draws are explicit and block playing and ending until the deck is clicked', () => {
  const playing = deal(roll(create()));
  const next = command(playing, { type: 'end', actor: playing.active });
  assert.equal(next.pending.task.op, 'draw');
  assert.equal(next.pending.task.text, 'turn');
  assert.equal(next.players[next.active].hand.length, 4);
  assert.match(applyCommand(next, { type: 'end', actor: next.active }, catalog).error, /選択/);
  const drawn = command(next, { type: 'choose', actor: next.active, option: 'yojo' });
  assert.equal(drawn.pending, null);
  assert.equal(drawn.players[next.active].hand.length, 5);
  assert.equal(drawn.players[next.active].yojo.length, 15);
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
  state = command(state, { type: 'openingDraw', actor: state.rules.firstPlayer, deck: 'yojo' });
  const restored = restoreGame(JSON.parse(JSON.stringify(state)), catalog);
  assert.deepEqual(restored, JSON.parse(JSON.stringify(state)));
  assert.equal(restored.phase, 'opening');
  assert.equal(restored.openingRemaining[restored.rules.firstPlayer], 2);
  const old = deal(restored);
  delete old.phase; delete old.dice;
  assert.equal(restoreGame(old, catalog).phase, 'playing');
});

test('CPU completes its required draws using the same commands as a human', () => {
  let state = roll(create());
  const actor = 1;
  const required = state.openingRemaining[actor], ownRequired = state.openingRemaining[0];
  let draws = 0;
  while (state.openingRemaining[actor] > 0) {
    const action = cpuCommand(state, catalog);
    assert.equal(action.type, 'openingDraw');
    assert.equal(action.actor, actor);
    state = command(state, action);
    draws++;
  }
  assert.equal(draws, required);
  assert.equal(state.players[actor].hand.length, required);
  assert.equal(state.openingRemaining[0], ownRequired);
  assert.equal(state.phase, 'opening');
});

test('each opening and turn draw allows a fresh choice of either deck', () => {
  let state = roll(create());
  const actor = state.rules.firstPlayer;
  for (const kind of ['sweet', 'yojo', 'sweet']) {
    state = command(state, { type: 'openingDraw', actor, deck: kind });
  }
  assert.equal(state.players[actor].sweet.length, 8);
  assert.equal(state.players[actor].yojo.length, 19);
  state = deal(state);
  state = command(state, { type: 'end', actor: state.active });
  assert.deepEqual(state.pending.options.map(o => o.id), ['yojo', 'sweet']);
  const before = state.players[state.active].sweet.length;
  state = command(state, { type: 'choose', actor: state.active, option: 'sweet' });
  assert.equal(state.players[state.active].sweet.length, before - 1);
  assert.equal(state.pending, null);
});

test('pierce bypasses guard and taunt does not constrain attack targets', () => {
  let state = deal(roll(create()));
  const actor = state.active, enemy = actor === 0 ? 1 : 0;
  const uid = state.players[actor].hand.shift();
  state.players[actor].field.push(uid);
  Object.assign(state.cards[uid], { slot: 0, entered: -1, keywords: ['pierce'], attackBonus: 1 });
  const taunt = state.players[enemy].hand.shift(), guard = state.players[enemy].hand.shift();
  state.players[enemy].field.push(taunt, guard);
  Object.assign(state.cards[taunt], { slot: 0, keywords: ['taunt'] });
  Object.assign(state.cards[guard], { slot: 1, keywords: ['guard'] });
  for (const target of ['leader', guard, taunt]) assert.equal(applyCommand(state, { type: 'attack', actor, uid, target }, catalog).error, undefined);
});


test('opening gives the second player four cards and waits for both confirmations', () => {
  let state = roll(create());
  while (state.phase === 'opening') state = command(state, { type: 'openingDraw', actor: state.openingRemaining.findIndex(count => count > 0), deck: 'yojo' });
  assert.equal(state.phase, 'mulligan');
  assert.equal(state.turn, 0);
  assert.equal(state.players[state.rules.firstPlayer].hand.length, 3);
  assert.equal(state.players[state.rules.firstPlayer === 0 ? 1 : 0].hand.length, 4);
  assert.ok(applyCommand(state, { type: 'end', actor: state.active }, catalog).error);
  state = command(state, { type: 'keep', actor: state.active });
  assert.equal(state.phase, 'mulligan');
  assert.equal(state.turn, 0);
  state = command(state, { type: 'keep', actor: state.active });
  assert.equal(state.phase, 'playing');
  assert.equal(state.active, state.rules.firstPlayer);
});

test('batch mulligan chooses decks, preserves every card, and confirms the hand once', () => {
  let state = roll(create());
  while (state.phase === 'opening') state = command(state, { type: 'openingDraw', actor: state.openingRemaining.findIndex(count => count > 0), deck: 'yojo' });
  const actor = state.active, original = [...state.players[actor].hand];
  const replacements = original.map((uid, i) => ({ uid, deck: i === 0 ? 'yojo' : 'sweet' }));
  const duplicate = applyCommand(state, { type: 'mulligan', actor, replacements: [replacements[0], replacements[0]] }, catalog);
  assert.ok(duplicate.error);
  assert.strictEqual(duplicate.state, state);
  state = command(state, { type: 'mulligan', actor, replacements });
  assert.equal(state.pending, null);
  assert.equal(state.players[actor].hand.length, original.length);
  assert.ok(original.every(uid => !state.players[actor].hand.includes(uid) && state.players[actor].yojo.includes(uid)));
  assert.equal(state.players[actor].hand.filter(uid => catalog[state.cards[uid].cardId].type === 'sweet').length, 2);
  const ids = ['hand', 'yojo', 'sweet'].flatMap(zone => state.players[actor][zone]);
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.equal(state.mulligan.confirmed[actor], true);
  assert.deepEqual(state.mulligan.eligible[actor], []);
  state = restoreGame(JSON.parse(JSON.stringify(state)), catalog);
  assert.ok(applyCommand(state, { type: 'mulligan', actor, replacements }, catalog).error);
  state = command(state, { type: 'keep', actor: state.active });
  assert.equal(state.phase, 'playing');
});

function combat() {
  const state = deal(roll(create()));
  const actor = state.active, enemy = actor === 0 ? 1 : 0;
  const put = side => {
    const uid = state.players[side].hand.shift();
    Object.assign(state.cards[uid], { slot: state.players[side].field.length, entered: -1, keywords: [], hpBonus: 10 });
    state.players[side].field.push(uid);
    return uid;
  };
  return { state, actor, enemy, uid: put(actor), guard: put(enemy), ordinary: put(enemy), put };
}

test('guard blocks sweets and non-guard units; fast does not bypass it and pierce does', () => {
  const { state, actor, uid, guard, ordinary } = combat();
  state.cards[guard].keywords = ['guard'];
  state.cards[uid].keywords = ['fast'];
  state.cards[uid].entered = state.turn;
  assert.equal(canAttack(state, actor, uid, 'leader', catalog), false);
  assert.equal(canAttack(state, actor, uid, ordinary, catalog), false);
  assert.equal(canAttack(state, actor, uid, guard, catalog), true);
  state.cards[uid].keywords.push('pierce');
  assert.equal(canAttack(state, actor, uid, 'leader', catalog), true);
  state.cards[guard].keywords.push('taunt');
  assert.equal(canAttack(state, actor, uid, 'leader', catalog), true);
  assert.equal(canAttack(state, actor, uid, ordinary, catalog), true);
  assert.equal(canAttack(state, actor, uid, guard, catalog), true);
});

test('charge permits only unit attacks on entry; fast permits both; spent units cannot attack', () => {
  const { state, actor, uid, ordinary } = combat();
  state.cards[uid].entered = state.turn;
  for (const keywords of [[], ['pierce']]) {
    state.cards[uid].keywords = keywords;
    assert.equal(canAttack(state, actor, uid, ordinary, catalog), false);
    assert.equal(canAttack(state, actor, uid, 'leader', catalog), false);
  }
  state.cards[uid].keywords = ['charge'];
  assert.equal(canAttack(state, actor, uid, ordinary, catalog), true);
  assert.equal(canAttack(state, actor, uid, 'leader', catalog), false);
  state.cards[uid].keywords = ['fast'];
  assert.equal(canAttack(state, actor, uid, ordinary, catalog), true);
  assert.equal(canAttack(state, actor, uid, 'leader', catalog), true);
  state.cards[uid].exhausted = true;
  assert.equal(canAttack(state, actor, uid, ordinary, catalog), false);
});

function resolveTask(state, actor, task) {
  state.queue.push({ actor, ...task });
  return command(state, { type: 'adjust', actor, resource: 'pp', delta: 0 }, true);
}

test('targeted effects respect enemy taunt in their scope, including any-side effects', () => {
  const { state, actor, uid, guard } = combat();
  state.cards[guard].keywords = ['taunt'];
  let next = resolveTask(structuredClone(state), actor, { op: 'damage', scope: 'enemy', amount: 4 });
  assert.deepEqual(next.pending.options.map(o => o.id), [guard]);
  next = resolveTask(structuredClone(state), actor, { op: 'copy', scope: 'any' });
  assert.deepEqual(next.pending.options.map(o => o.id), [guard]);
  next = resolveTask(structuredClone(state), actor, { op: 'buff', scope: 'friendly', amount: 1 });
  assert.deepEqual(next.pending.options.map(o => o.id), [uid]);
  state.cards[uid].keywords = ['taunt'];
  state.cards[guard].keywords = [];
  next = resolveTask(structuredClone(state), actor, { op: 'damage', scope: 'enemy', amount: 4 });
  assert.equal(next.pending.options.length, 2);
});

test('two-target damage cannot fill remaining targets with ordinary units after killing taunt', () => {
  const { state, actor, guard, ordinary } = combat();
  state.cards[guard].keywords = ['taunt'];
  state.cards[guard].hpBonus = 0;
  let next = resolveTask(state, actor, { op: 'damage', scope: 'enemy', amount: 4, count: 2 });
  next = restoreGame(JSON.parse(JSON.stringify(next)), catalog);
  next = command(next, { type: 'choose', actor, option: guard });
  assert.equal(next.pending, null);
  assert.equal(next.cards[ordinary].damage, 0);
});

test('global and random effects are not concentrated by taunt', () => {
  const { state, actor, guard, ordinary } = combat();
  state.cards[guard].keywords = ['taunt'];
  const next = resolveTask(state, actor, { op: 'allDamage', scope: 'enemy', amount: 2 });
  assert.equal(next.cards[guard].damage, 2);
  assert.equal(next.cards[ordinary].damage, 2);
  assert.equal(next.pending, null);
});
