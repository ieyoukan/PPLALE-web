// Attacks between units and on the opponent's sweets.
import { scriptOf } from '../cards/registry.ts';
import { cardContext } from '../effects/context.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';
import { attackOf, hit, note } from './cards.ts';
import { losePoints } from './points.ts';
import { settle } from './zones.ts';

export function canAttack(s: GameState, side: Side, uid: string, target: string | 'leader', catalog: Catalog): boolean {
    const p = s.players[side], c = s.cards[uid];
    if (s.phase !== 'playing' || s.active !== side || s.pending || s.winner !== null || !p.field.includes(uid) || !c || c.exhausted || c.keywords.includes('immobile') || attackOf(c, catalog) <= 0)
        return false;
    // Summoning sickness: fast allows any target, charge only units.
    if (c.entered === s.turn && !c.keywords.includes('fast') && !(target !== 'leader' && c.keywords.includes('charge')))
        return false;
    const enemy = s.players[other(side)];
    const taunts = enemy.field.filter(id => s.cards[id].keywords.includes('taunt'));
    // Taunt units are the only legal targets while any is on the field (user-confirmed rule).
    if (taunts.length) return taunts.includes(target);
    if (target === 'leader')
        return !c.keywords.includes('noEat') && (!enemy.field.some(id => s.cards[id].keywords.includes('guard')) || c.keywords.includes('pierce'));
    return enemy.field.includes(target);
}

/**
 * The unit eats the opponent's sweets. It counts as having eaten (for りくす) even when a barrier
 * nullifies the change; only a taunt stops the attempt itself.
 */
export function eat(s: GameState, side: Side, uid: string, amount: number) {
    const result = losePoints(s, other(side), amount, 'eat');
    if (result.blocked !== 'taunt') s.cards[uid].ateOn = s.turn;
    return result;
}

/** Call only after `canAttack`. */
export function resolveAttack(s: GameState, side: Side, uid: string, target: string | 'leader', catalog: Catalog) {
    const attacker = s.cards[uid];
    attacker.exhausted = true;
    scriptOf(attacker.cardId).onAttack?.(cardContext(s, catalog, side, uid), target);
    settle(s, catalog);
    if (target === 'leader') {
        eat(s, side, uid, attackOf(attacker, catalog));
        note(s, `${catalog[attacker.cardId].name}がお菓子を食べました`);
        return;
    }
    // Simultaneous damage, only if both survived the attack-time effects.
    if (!s.players[side].field.includes(uid) || !s.players[other(side)].field.includes(target)) return;
    const defender = s.cards[target], a = attackOf(attacker, catalog), b = attackOf(defender, catalog);
    hit(s, target, a, false);
    hit(s, uid, b, false);
    note(s, `${catalog[attacker.cardId].name}が${catalog[defender.cardId].name}を攻撃`);
}
