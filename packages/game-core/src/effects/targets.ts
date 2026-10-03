import { other } from '../model.ts';
import type { GameState, Side, Task } from '../model.ts';

/** Units a step may affect: its scope relative to the acting side. */
export function unitsInScope(s: GameState, t: Pick<Task, 'actor' | 'scope'>): string[] {
    if (t.scope === 'friendly') return s.players[t.actor].field;
    if (t.scope === 'any') return s.players.flatMap(p => p.field);
    return s.players[other(t.actor)].field;
}

/**
 * Taunt concentrates explicit selections: when enemy taunt units are among the candidates, only
 * they can be chosen. Global and random effects do not use this.
 */
export function selectable(s: GameState, actor: Side, candidates: string[]): string[] {
    const enemy = s.players[other(actor)].field;
    const taunts = candidates.filter(id => enemy.includes(id) && s.cards[id].keywords.includes('taunt'));
    return taunts.length ? taunts : candidates;
}
