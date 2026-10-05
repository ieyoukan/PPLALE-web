import test from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN_CARD, applyCommand, newGame, sandboxRules, viewFor } from '../dist/index.js';
import { arena, catalog } from './helpers.mjs';

const deck = { name: 'テスト', yojo: Array.from({ length: 20 }, (_, i) => `y_${i + 1}`), sweet: Array.from({ length: 10 }, (_, i) => `s_${i + 1}`), playable: 'p_0' };

test('a view hides both decks, the opponent hand and the seed, and keeps what the viewer holds', () => {
  const s = arena({ me: { hand: ['y_1', 's_2'], field: ['y_3'] }, foe: { hand: ['y_4', 'y_5'], field: ['y_6'], nap: ['y_7'] } });
  s.cards[s.players[1].hand[1]].revealed = true;
  s.queue = [{ op: 'draw', actor: 1, target: s.players[1].yojo[0] }];
  const view = viewFor(s, 0);
  const ids = uids => uids.map(uid => view.cards[uid].cardId);
  assert.deepEqual(ids(view.players[0].hand), ['y_1', 's_2']);
  assert.deepEqual(ids(view.players[1].hand), [HIDDEN_CARD, 'y_5']);
  assert.deepEqual(ids([...view.players[0].field, ...view.players[1].field, ...view.players[1].nap]), ['y_3', 'y_6', 'y_7']);
  for (const side of [0, 1]) for (const kind of ['yojo', 'sweet']) {
    assert.equal(view.players[side][kind].length, s.players[side][kind].length);
    assert.ok(ids(view.players[side][kind]).every(id => id === HIDDEN_CARD));
  }
  assert.equal(view.rng, 0);
  assert.deepEqual(view.queue, []);
  // The original is untouched.
  assert.notEqual(s.rng, 0);
  assert.equal(s.cards[s.players[1].hand[0]].cardId, 'y_4');
});

test('a view does not tell the order of a deck', () => {
  const orders = [1, 2, 3].map(seed => viewFor(newGame([deck, deck], catalog, sandboxRules, seed), 0).players[0].yojo.join());
  assert.equal(new Set(orders).size, 1);
});

test("the opponent's choice keeps its public options and drops the hidden cards", () => {
  const s = arena({ foe: { hand: ['y_4'], field: ['y_6'] } });
  const [inHand] = s.players[1].hand, [onField] = s.players[1].field, inDeck = s.players[1].yojo[0];
  s.pending = {
    prompt: '選ぶ', task: { op: 'searchRole', actor: 1, candidates: [inDeck], target: inDeck },
    options: [{ id: inHand, label: 'てふだ' }, { id: onField, label: 'ば' }, { id: inDeck, label: 'やま' }, { id: 'skip', label: 'やめる' }],
  };
  const foe = viewFor(s, 0).pending;
  assert.deepEqual(foe.options.map(o => o.id), [onField, 'skip']);
  assert.deepEqual(foe.task, { op: 'searchRole', actor: 1 });
  // The one choosing sees every option, and the deck cards it may take.
  const own = viewFor(s, 1);
  assert.equal(own.pending.options.length, 4);
  assert.equal(own.cards[inDeck].cardId, s.cards[inDeck].cardId);
});

test('a view is still a match the board can read after every opening command', () => {
  let s = newGame([deck, deck], catalog, sandboxRules, 5);
  for (const command of [{ type: 'roll', actor: 0 }, { type: 'roll', actor: 1 }]) s = applyCommand(s, command, catalog).state;
  for (const side of [0, 1]) {
    const view = viewFor(s, side);
    assert.deepEqual(view.dice, s.dice);
    assert.deepEqual(view.log, s.log);
    assert.equal(Object.keys(view.cards).length, Object.keys(s.cards).length);
  }
});

test('a spectator sees both hands, and of the decks and a choice only what is public', () => {
  const s = arena({ me: { hand: ['y_1'] }, foe: { hand: ['y_4', 'y_5'], field: ['y_6'] } });
  const inDeck = s.players[1].yojo[0], [inHand] = s.players[1].hand;
  s.pending = { prompt: '選ぶ', task: { op: 'searchRole', actor: 1, candidates: [inDeck] }, options: [{ id: inHand, label: 'てふだ' }, { id: inDeck, label: 'やま' }] };
  const view = viewFor(s, 'spectator');
  const ids = uids => uids.map(uid => view.cards[uid].cardId);
  assert.deepEqual(ids(view.players[0].hand), ['y_1']);
  assert.deepEqual(ids(view.players[1].hand), ['y_4', 'y_5']);
  for (const side of [0, 1]) for (const kind of ['yojo', 'sweet']) assert.ok(ids(view.players[side][kind]).every(id => id === HIDDEN_CARD));
  assert.deepEqual(view.pending.options.map(o => o.id), [inHand]);
  assert.equal(view.rng, 0);
});
