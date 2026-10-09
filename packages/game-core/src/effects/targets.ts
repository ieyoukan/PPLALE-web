import { other } from '../model.ts';
import type { GameState, Side, Task } from '../model.ts';
import { isHidden } from '../core/protection.ts';

/** Units a step may affect: its scope relative to the acting side. */
export function unitsInScope(s: GameState, t: Pick<Task, 'actor' | 'scope'>): string[] {
    if (t.scope === 'friendly') return s.players[t.actor].field;
    if (t.scope === 'any') return s.players.flatMap(p => p.field);
    return s.players[other(t.actor)].field;
}

/** Enemy taunt concentrates selected effects, within the effect's own eligible scope. */
export function selectable(s: GameState, actor: Side, candidates: string[], ignoreAvoidance = false): string[] {
    const enemy = s.players[other(actor)].field;
    candidates = candidates.filter(uid => ignoreAvoidance || !enemy.includes(uid) || !isHidden(s, uid));
    const taunts = candidates.filter(id => enemy.includes(id) && s.cards[id].keywords.includes('taunt'));
    return taunts.length ? taunts : candidates;
}
