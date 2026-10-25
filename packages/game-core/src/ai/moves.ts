// Compatibility exports; all game clients use the same engine-owned action enumeration.
export { actingSides } from '../core/actions.ts';
export { legalActions as legalMoves } from '../gameplay/actions.ts';
export type { LegalAction as Move } from '../gameplay/actions.ts';
import type { LegalAction as Move } from '../gameplay/actions.ts';
import { immobilized } from '../core/cards.ts';
import { commonSkill, skillAt } from '../playables/skills.ts';
import { effects } from '../effects/context.ts';
import { other } from '../model.ts';
import type { Catalog, GameState, Side } from '../model.ts';

/**
 * Charge only lets a unit that entered this turn attack another unit. Giving it to anyone else,
 * or when the opponent has no units, changes nothing the rules care about.
 */
function chargeUseless(s: GameState, side: Side, uid: string): boolean {
    const c = s.cards[uid];
    return !s.players[other(side)].field.length || !c || c.entered !== s.turn || c.exhausted
        || c.keywords.some(k => k === 'charge' || k === 'fast' || k === 'immobile') || immobilized(s, uid);
}

/**
 * Legal moves the search should not spend its budget on, because they only use up something
 * (a limited skill) without any effect. The evaluation cannot always see that, and these moves
 * crowd the useful ones out of a narrow search.
 */
export function pointless(s: GameState, move: Move, catalog?: Catalog): boolean {
    const c = move.command;
    if (c.type === 'skill' && skillAt(s.players[c.actor], c.index)?.skill.name === commonSkill.name) {
        // The charge skill targets a unit of its own side.
        return s.players[c.actor].field.every(uid => chargeUseless(s, c.actor, uid));
    }
    // A skill that says itself it would do nothing now (MP already at its maximum, nobody to hit).
    if (c.type === 'skill' && catalog) return !!skillAt(s.players[c.actor], c.index)?.skill.wasted?.(effects(s, catalog, c.actor));
    const task = s.pending?.task;
    if (c.type === 'choose' && task?.op === 'keyword' && task.keyword === 'charge' && task.actor === c.actor) {
        // Picking among the targets: keep at least one so the effect can still resolve.
        return chargeUseless(s, c.actor, c.option) && s.pending!.options.some(o => !chargeUseless(s, c.actor, o.id));
    }
    return false;
}
