import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK_IMAGE_WIDTH, DECK_IMAGE_HEIGHT, deckImageLayout } from '../src/lib/deckImageLayout.ts';

test('deck layout preserves copies in natural order and keeps the three groups separate', () => {
  const deck = { yojoDeckIds: ['y_10', 'y_2', 'y_2', 'y_1'], sweetDeckIds: ['s_10', 's_2'], playableCardId: 'p_1' };
  const original = structuredClone(deck);
  const slots = deckImageLayout(deck), filled = slots.filter(slot => slot.id);
  assert.deepEqual(filled.map(slot => slot.id), ['y_1', 'y_2', 'y_2', 'y_10', 's_2', 's_10', 'p_1']);
  assert.deepEqual(deck, original);
  assert.equal(slots.filter(slot => slot.kind === 'yojo').length, 20);
  assert.equal(slots.filter(slot => slot.kind === 'sweet').length, 10);
  const yojoRight = Math.max(...slots.filter(slot => slot.kind === 'yojo').map(slot => slot.left + slot.width));
  const sweetLeft = Math.min(...slots.filter(slot => slot.kind === 'sweet').map(slot => slot.left));
  assert.ok(yojoRight < sweetLeft);
  const playable = slots.find(slot => slot.kind === 'playable');
  assert.equal(playable.left, sweetLeft);
  assert.ok(playable.top >= Math.max(...slots.filter(slot => slot.kind === 'sweet').map(slot => slot.top + slot.height)));
  for (const slot of slots) {
    assert.ok(slot.left >= 0 && slot.top >= 0);
    assert.ok(slot.left + slot.width <= DECK_IMAGE_WIDTH);
    assert.ok(slot.top + slot.height <= DECK_IMAGE_HEIGHT);
  }
});

test('partial and overfull decks keep stable empty slots and respect deck limits', () => {
  const empty = deckImageLayout({ yojoDeckIds: [], sweetDeckIds: [], playableCardId: null });
  assert.ok(empty.every(slot => slot.id === null));
  const full = deckImageLayout({ yojoDeckIds: Array(200).fill('y_0'), sweetDeckIds: Array(50).fill('s_0'), playableCardId: 'p_0' });
  assert.equal(full.filter(slot => slot.id).length, 31);
  assert.deepEqual(full.map(({ id, ...slot }) => slot), empty.map(({ id, ...slot }) => slot));
});
