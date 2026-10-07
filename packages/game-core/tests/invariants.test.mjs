// Plays many CPU matches with random strawberry decks and checks, before every command, rules that
// must hold whatever cards were involved: limits (skill uses, points, field size) and card bookkeeping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hpOf, playMatch, skillsFor } from '../dist/index.js';
import { catalog } from './helpers.mjs';

const FIELD_SIZE = 7;
/** Raise for a deeper sweep: INVARIANT_MATCHES=2000 node --test tests/invariants.test.mjs */
const MATCHES = Number(process.env.INVARIANT_MATCHES ?? 40);
const zones = ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'];

function check(s) {
  const seen = new Map();
  s.players.forEach((p, side) => {
    const where = `${p.name}(${side})`;
    skillsFor(p.playable).forEach((skill, index) => {
      assert.ok(p.skills[index] >= 0 && p.skills[index] <= skill.uses, `${where} ${skill.name} の残り回数 ${p.skills[index]} / ${skill.uses}`);
    });
    assert.ok(p.points >= 0 && p.points <= p.maxPoints, `${where} お菓子 ${p.points} / ${p.maxPoints}`);
    assert.ok(p.pp >= 0, `${where} PP ${p.pp}`);
    assert.ok(p.sweetBoost >= 0, `${where} sweetBoost ${p.sweetBoost}`);
    assert.ok(p.field.length <= FIELD_SIZE, `${where} 場 ${p.field.length}`);
    const slots = p.field.map(uid => s.cards[uid].slot);
    assert.ok(slots.every(slot => Number.isInteger(slot) && slot >= 0 && slot < FIELD_SIZE), `${where} slot ${slots}`);
    assert.equal(new Set(slots).size, slots.length, `${where} slot の重複 ${slots}`);
    for (const uid of p.field) assert.equal(catalog[s.cards[uid].cardId].type, 'yojo', `${where} 場に幼女以外 ${s.cards[uid].cardId}`);
    for (const zone of zones) {
      for (const uid of p[zone]) {
        assert.ok(!seen.has(uid), `${s.cards[uid].cardId} が ${seen.get(uid)} と ${where}.${zone} の両方にある`);
        seen.set(uid, `${where}.${zone}`);
        if (zone !== 'field') assert.equal(s.cards[uid].slot, null, `${where}.${zone} の ${s.cards[uid].cardId} に slot が残っている`);
      }
    }
    // Every effect step has resolved: no unit is left on the field at 0 HP.
    if (!s.pending && !s.queue.length) {
      for (const uid of p.field) assert.ok(hpOf(s.cards[uid], catalog) > 0, `${where} HP0 の ${s.cards[uid].cardId} が場に残っている`);
    }
  });
  for (const uid of Object.keys(s.cards)) assert.ok(seen.has(uid), `${s.cards[uid].cardId} がどこにもない`);
}

test('invariants hold throughout random CPU matches', () => {
  for (let seed = 1; seed <= MATCHES; seed++) {
    let previous;
    playMatch(catalog, {
      levels: seed % 2 ? ['easy', 'normal'] : ['normal', 'easy'],
      seed,
      onStep(s, command) {
        try {
          check(s);
          // The hand limit is applied when a turn is handed over.
          if (previous && previous.active !== s.active) {
            const ended = s.players[previous.active];
            assert.ok(ended.hand.length <= 9, `${ended.name} 手札 ${ended.hand.length}`);
          }
        } catch (error) {
          error.message = `seed ${seed} turn ${s.turn} before ${JSON.stringify(command)}: ${error.message}`;
          throw error;
        }
        previous = s;
      },
    });
  }
});
