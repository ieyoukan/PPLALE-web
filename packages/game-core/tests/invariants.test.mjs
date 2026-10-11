// Plays many CPU matches with random strawberry decks and checks, before every command, rules that
// must hold whatever cards were involved: limits (skill uses, points, field size) and card bookkeeping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hpOf, mpMax, playMatch, randomDeck, skillLimit, skillsFor } from '../dist/index.js';
import { catalog } from './helpers.mjs';

const FIELD_SIZE = 7;
/** Raise for a deeper sweep: INVARIANT_MATCHES=2000 node --test tests/invariants.test.mjs */
const MATCHES = Number(process.env.INVARIANT_MATCHES ?? 40);
const zones = ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'];

function check(s) {
  const seen = new Map();
  s.players.forEach((p, side) => {
    const where = `${p.name}(${side})`;
    // The limit is the printed one plus what a passive adds (いのまこ); a skill without a limit stays at 0.
    skillsFor(p.playable).forEach((skill, index) => {
      const limit = skillLimit(p, index, catalog);
      assert.ok(p.skills[index] >= 0 && p.skills[index] <= limit, `${where} ${skill.name} の残り回数 ${p.skills[index]} / ${limit}`);
    });
    assert.equal(p.skills.length, skillsFor(p.playable).length, `${where} スキルの数`);
    assert.ok((p.mp ?? 0) >= 0 && (p.mp ?? 0) <= mpMax(p.playable), `${where} MP ${p.mp} / ${mpMax(p.playable)}`);
    assert.ok(p.nextPpDebt >= 0, `${where} 次のターンのPP減少 ${p.nextPpDebt}`);
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

/** Plays one CPU match (random strawberry decks unless given) and checks the invariants before every command. */
function checkedMatch(seed, decks) {
    let previous;
    playMatch(catalog, {
      levels: seed % 2 ? ['easy', 'normal'] : ['normal', 'easy'],
      seed, decks,
      onStep(s, command) {
        try {
          check(s);
          // The hand limit is applied when a turn is handed over, before the turn-end effects:
          // ぶどうのゆうひ's turn-end draw may leave 10 (ぶどうFAQ⑤-2).
          if (previous && previous.active !== s.active) {
            const ended = s.players[previous.active], endDraws = previous.players[previous.active].field.filter(uid => previous.cards[uid].cardId === 'y_47').length;
            assert.ok(ended.hand.length <= 9 + endDraws, `${ended.name} 手札 ${ended.hand.length}`);
          }
        } catch (error) {
          error.message = `seed ${seed} turn ${s.turn} before ${JSON.stringify(command)}: ${error.message}`;
          throw error;
        }
        previous = s;
      },
    });
}

test('invariants hold throughout random CPU matches', () => {
  for (let seed = 1; seed <= MATCHES; seed++) checkedMatch(seed);
});

// Melon has no お菓子 of its own, so it is played with another fruit; most of the 幼女 are melon.
const melonUnits = Object.keys(catalog).filter(id => /^y_\d+$/.test(id) && catalog[id].fruit === 'melon');
function melonDeck(seed, partner) {
  const deck = randomDeck({ fruits: ['melon', partner], extendedPlayable: true }, catalog, seed);
  let r = seed >>> 0;
  const next = n => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % n; };
  return { ...deck, yojo: [...deck.yojo.slice(0, 4), ...Array.from({ length: 16 }, () => melonUnits[next(melonUnits.length)])] };
}

test('invariants hold throughout CPU matches with melon decks', () => {
  for (let seed = 1; seed <= MATCHES; seed++) {
    // Both decks under the same rules (ぷぷりえーる is not allowed where orange is).
    const partner = ['strawberry', 'grape', 'orange'][seed % 3];
    checkedMatch(seed, [melonDeck(seed, partner), melonDeck(Math.imul(seed, 31) + 7, partner)]);
  }
});
