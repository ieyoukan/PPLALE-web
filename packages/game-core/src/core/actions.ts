// Rule facts shared by engine clients: required actor and pre-action resource cost.
import { costOf } from './cards.ts';
import { sides } from '../model.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { skillAt, skillPrice } from '../playables/skills.ts';
import { exSkillInfo } from '../playables/exSkills.ts';

export interface ActionCost { pp: number; mp: number; acorns: number; timing: 'commit' | 'immediate' | 'effect' }

/** Required resource amounts, not a net before/after delta (which could expose future draws). */
export function actionCost(s: GameState, command: Command, catalog: Catalog): ActionCost {
    const p = s.players[command.actor];
    if (command.type === 'play') return { pp: costOf(s, command.uid, catalog, command.actor), mp: 0, acorns: 0, timing: 'commit' };
    if (command.type === 'skill') {
        const taken = skillAt(p, command.index);
        const price = taken?.extra !== undefined ? { pp: taken.skill.cost, mp: taken.skill.mp ?? 0 } : skillPrice(p, command.index, catalog);
        return { ...price, acorns: 0, timing: 'immediate' };
    }
    return { pp: command.type === 'exSkill' ? exSkillInfo[command.skill].cost : 0, mp: 0,
        acorns: command.type === 'acorn' ? 1 : 0, timing: command.type === 'choose' ? 'effect' : 'immediate' };
}

/** Sides that may send a command now. In the opening and mulligan both sides act in parallel. */
export function actingSides(s: GameState): Side[] {
    if (s.winner !== null) return [];
    if (s.pending) return [s.pending.task.actor];
    switch (s.phase) {
        case 'dice': {
            const rolls = s.dice?.rolls;
            return [!rolls || rolls.every(value => value !== null) || rolls[0] === null ? 0 : 1];
        }
        case 'opening': return sides.filter(side => s.openingRemaining[side] > 0);
        case 'mulligan': return sides.filter(side => !s.mulligan.confirmed[side]);
        default: return [s.active];
    }
}

