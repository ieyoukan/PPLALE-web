// Shared fixtures for card / skill tests. Builds a mid-game board directly instead of
// playing through the opening, so each test only states the cards it is about.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCommand, newGame, sandboxRules, spawnCard } from '../dist/index.js';

const data = name => JSON.parse(readFileSync(new URL(`../../../src/data/${name}.json`, import.meta.url)))[name];
export const catalog = Object.fromEntries([
  ...data('yojo'), ...data('sweet'), ...data('playable'), ...data('tokenYojo'),
  { id: 'token_cat', name: '猫まんじゅう', type: 'yojo', fruit: 'strawberry', cost: 1, attack: 1, hp: 1 },
  { id: 'token_pudding', name: 'ギガプリン', type: 'yojo', fruit: 'strawberry', cost: 5, attack: 0, hp: 7 },
].map(card => [card.id, card]));

const filler = { name: 'テスト', yojo: Array(20).fill('y_17'), sweet: Array(10).fill('s_19'), playable: 'p_0' };

/**
 * Side 0 is the active player on turn 3 (its own 2nd turn) with 10 PP unless overridden.
 * Each side accepts: hand, field, nap, yojo, sweet (card ids, deck tops first), playable,
 * points, pp, turns, ppBonus.
 */
export function arena({ me = {}, foe = {}, rules = {}, seed = 7 } = {}) {
  const s = newGame([{ ...filler, playable: me.playable ?? 'p_0' }, { ...filler, playable: foe.playable ?? 'p_0' }], catalog, { ...sandboxRules, ...rules }, seed);
  Object.assign(s, { phase: 'playing', turn: 3, active: 0 });
  [me, foe].forEach((opts, side) => {
    const p = s.players[side];
    p.turns = opts.turns ?? (side === 0 ? 2 : 1);
    p.ppBonus = opts.ppBonus ?? 10 - p.turns;
    p.pp = opts.pp ?? 10;
    if (opts.points !== undefined) p.points = opts.points;
    for (const zone of ['hand', 'nap']) p[zone] = (opts[zone] ?? []).map(id => spawnCard(s, id));
    for (const zone of ['yojo', 'sweet']) if (opts[zone]) p[zone] = [...opts[zone].map(id => spawnCard(s, id)), ...p[zone]];
    p.field = (opts.field ?? []).map((id, slot) => {
      const uid = spawnCard(s, id);
      Object.assign(s.cards[uid], { slot, entered: 0 });
      return uid;
    });
  });
  return s;
}

export function run(s, command, adjust = false) {
  const result = applyCommand(s, command, catalog, adjust);
  assert.equal(result.error, undefined, `${command.type}: ${result.error}`);
  return result.state;
}
export const failure = (s, command) => applyCommand(s, command, catalog).error;
export const play = (s, uid, slot) => run(s, { type: 'play', actor: s.active, uid, slot });
export const playFirst = (s, cardId) => play(s, hand(s, s.active).find(uid => s.cards[uid].cardId === cardId));
export const choose = (s, option) => run(s, { type: 'choose', actor: s.pending.task.actor, option });
export const skill = (s, index) => run(s, { type: 'skill', actor: s.active, index });
/** Resolves every pending draw from the given deck (or a per-draw list of decks). */
export function draws(s, decks = 'yojo') {
  const list = Array.isArray(decks) ? [...decks] : null;
  while (s.pending?.task.op === 'draw') {
    const wanted = list ? list.shift() : decks;
    s = choose(s, optionIds(s).includes(wanted) ? wanted : optionIds(s)[0]);
  }
  return s;
}
export const hand = (s, side = 0) => s.players[side].hand;
export const field = (s, side = 0) => s.players[side].field;
export const idsOf = (s, uids) => uids.map(uid => s.cards[uid].cardId);
export const stats = (s, uid) => {
  const c = s.cards[uid], d = catalog[c.cardId];
  return [Math.max(0, d.attack + c.attackBonus), d.hp + c.hpBonus - c.damage];
};
/** Last unit that entered the given side's field. */
export const newest = (s, side = 0) => s.players[side].field.at(-1);
export const optionIds = s => s.pending.options.map(o => o.id);
