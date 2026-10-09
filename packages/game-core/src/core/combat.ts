// Attacks between units and on the opponent's sweets.
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';
import { attackOf } from './cards.ts';
import { isHidden } from './protection.ts';
import { losePoints } from './points.ts';

export function canAttack(s: GameState, side: Side, uid: string, target: string | 'leader', catalog: Catalog): boolean {
    const p = s.players[side], c = s.cards[uid];
    const conditionalImmobile = !c?.silenced && (c?.cardId === 'y_47' ? catalog[c.cardId].hp + c.hpBonus - c.damage > 5 : c?.cardId === 'y_50' && p.skills.some(left => left > 0));
    if (s.phase !== 'playing' || s.active !== side || s.pending || s.winner !== null || !p.field.includes(uid) || !c || c.exhausted || c.keywords.includes('immobile') || conditionalImmobile || attackOf(c, catalog) <= 0)
        return false;
    // Summoning sickness: fast allows any target, charge only units.
    if (c.entered === s.turn && !c.keywords.includes('fast') && !(target !== 'leader' && c.keywords.includes('charge')))
        return false;
    const enemy = s.players[other(side)];
    if (target !== 'leader' && (!enemy.field.includes(target) || isHidden(s, target))) return false;
    if (target === 'leader' && c.keywords.includes('noEat')) return false;
    // Guard protects both sweets and non-guard units. Pierce bypasses both restrictions.
    const guards = enemy.field.filter(id => s.cards[id].keywords.includes('guard') && !isHidden(s, id));
    if (guards.length && !c.keywords.includes('pierce')) return guards.includes(target);
    if (target === 'leader')
        return !c.keywords.includes('noEat');
    return enemy.field.includes(target);
}

/**
 * The unit eats the opponent's sweets. It counts as having eaten (for りくす) even when a barrier
 * nullifies the change. Attack target restrictions are checked by canAttack.
 */
export function eat(s: GameState, side: Side, uid: string, amount: number) {
    const result = losePoints(s, other(side), amount, 'eat');
    s.cards[uid].ateOn = s.turn;
    return result;
}

/** Call only after `canAttack`. */
export function resolveAttack(s: GameState, side: Side, uid: string, target: string | 'leader') {
    const attacker = s.cards[uid];
    attacker.exhausted = true;
    attacker.hiding = false;
    s.queue.push({ op: 'attackStart', actor: side, source: uid, target });
}
