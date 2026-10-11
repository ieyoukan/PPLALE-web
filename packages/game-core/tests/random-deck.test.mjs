import test from 'node:test';
import assert from 'node:assert/strict';
import { deckRuleErrors, isExtendedPlayable, newGame, playableNow, randomDeck, sandboxRules, validateDeck } from '../dist/index.js';
import { catalog } from './helpers.mjs';

// Every rule a match can be made with today: each non-empty set of the playable fruits, with and without 拡張プレイアブル.
const fruitSets = playableNow.fruits.reduce((sets, fruit) => [...sets, ...sets.map(set => [...set, fruit])], [[]]).filter(set => set.length);
const everyRules = fruitSets.flatMap(fruits => [false, true].map(extendedPlayable => ({ fruits, extendedPlayable })));
// A fruit without お菓子 of its own (melon) cannot fill a deck alone: such rules get no deck (tested below).
const fillable = rules => ['yojo', 'sweet'].every(kind => Object.values(catalog).some(card => card.type === kind && rules.fruits.includes(card.fruit)));
const allRules = everyRules.filter(fillable);
const seeds = Array.from({ length: 150 }, (_, i) => Math.imul(i, 2654435761) >>> 0);
const count = (list, id) => list.filter(other => other === id).length;

test('randomDeck: every seed gives a deck the rules accept, of the allowed fruits only', () => {
  assert.ok(allRules.length >= 2);
  for (const rules of allRules) for (const seed of seeds) {
    const deck = randomDeck(rules, catalog, seed), where = `${JSON.stringify(rules)} seed ${seed}`;
    assert.ok(deck, where);
    assert.deepEqual(deckRuleErrors(deck, rules, catalog), [], where);
    assert.deepEqual([deck.yojo.length, deck.sweet.length], [20, 10], where);
    for (const id of [...deck.yojo, ...deck.sweet]) assert.ok(rules.fruits.includes(catalog[id].fruit), `${id} in ${where}`);
    if (!rules.extendedPlayable) assert.equal(isExtendedPlayable(catalog, deck.playable), false, where);
  }
});

test('randomDeck: two decks of the same rules start a match', () => {
  for (const rules of allRules) for (const seed of seeds.slice(0, 20))
    assert.doesNotThrow(() => newGame([randomDeck(rules, catalog, seed), randomDeck(rules, catalog, seed + 1)], catalog, sandboxRules, seed));
});

test('randomDeck: the same seed gives the same deck, and seeds reach every allowed fruit and playable', () => {
  for (const rules of allRules) {
    assert.deepEqual(randomDeck(rules, catalog, 7), randomDeck(rules, catalog, 7));
    const decks = seeds.map(seed => randomDeck(rules, catalog, seed));
    assert.ok(new Set(decks.map(deck => deck.yojo.join())).size > seeds.length / 2);
    for (const kind of ['yojo', 'sweet'])
      assert.deepEqual(new Set(decks.flatMap(deck => deck[kind].map(id => catalog[id].fruit))), new Set(rules.fruits), `${kind} of ${rules.fruits}`);
    const allowed = Object.keys(catalog).filter(id => catalog[id].type === 'playable' && (rules.extendedPlayable || !isExtendedPlayable(catalog, id))
      && validateDeck({ ...decks[0], playable: id }, catalog).length === 0);
    assert.deepEqual(new Set(decks.map(deck => deck.playable)), new Set(allowed));
  }
});

test('randomDeck: at most two of a card where the allowed cards are plenty, more only where they are few', () => {
  for (const seed of seeds) {
    const deck = randomDeck({ fruits: ['strawberry'], extendedPlayable: false }, catalog, seed);
    for (const id of [...deck.yojo, ...deck.sweet]) assert.ok(count([...deck.yojo, ...deck.sweet], id) <= 2, `${id} seed ${seed}`);
  }
  // Three kinds of お菓子 cannot fill ten places two at a time.
  const few = Object.fromEntries(Object.entries(catalog).filter(([id, card]) => card.type !== 'sweet' || ['s_6', 's_7', 's_8'].includes(id)));
  const deck = randomDeck({ fruits: ['strawberry'], extendedPlayable: false }, few, 3);
  assert.deepEqual(validateDeck(deck, few), []);
  assert.ok(deck.sweet.some(id => count(deck.sweet, id) > 2));
});

test('randomDeck: no deck where the allowed cards cannot fill one', () => {
  for (const rules of everyRules.filter(rules => !fillable(rules))) assert.equal(randomDeck(rules, catalog, 1), null);
  const rules = { fruits: ['strawberry'], extendedPlayable: false };
  const without = type => Object.fromEntries(Object.entries(catalog).filter(([, card]) => card.type !== type));
  assert.equal(randomDeck(rules, without('sweet'), 1), null);
  assert.equal(randomDeck(rules, without('yojo'), 1), null);
  assert.equal(randomDeck(rules, without('playable'), 1), null);
  assert.equal(randomDeck({ fruits: [], extendedPlayable: false }, catalog, 1), null);
  // Only cards a deck may hold once: four チャイ are not ten お菓子.
  const chai = Object.fromEntries(Object.entries(catalog).filter(([id, card]) => card.type !== 'sweet' || /^s_(28|29|30|31)$/.test(id)));
  assert.equal(randomDeck({ fruits: ['grape'], extendedPlayable: false }, chai, 1), null);
});

test('randomDeck: no ぷぷりえーる where orange is allowed', () => {
  const withOrange = seeds.map(seed => randomDeck({ fruits: ['strawberry', 'orange'], extendedPlayable: false }, catalog, seed));
  assert.ok(withOrange.every(deck => !deck.sweet.includes('s_24')));
  const strawberry = seeds.map(seed => randomDeck({ fruits: ['strawberry'], extendedPlayable: false }, catalog, seed));
  assert.ok(strawberry.some(deck => deck.sweet.includes('s_24')));
});
