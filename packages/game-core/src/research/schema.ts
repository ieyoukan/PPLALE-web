import { keywords } from '../model.ts';
import { RESEARCH_VERSION } from './types.ts';
import type { FeatureSpec, ResearchSchema } from './types.ts';

const feature = (name: string, kind: FeatureSpec['kind'], scale = 1, value?: string): FeatureSpec => ({
    name, path: name.split('.'), kind, scale, ...(value === undefined ? {} : { value }),
});
const number = (name: string, scale = 1) => feature(name, 'number', scale);
const bool = (name: string) => feature(name, 'boolean');
const length = (name: string, scale = 1) => feature(name, 'length', scale);
const vocabulary = (path: string, values: readonly string[], kind: 'contains' | 'equals'): FeatureSpec[] =>
    values.map(value => ({ ...feature(path, kind, 1, value), name: `${path}:${value}` }));

/** No per-card-id dimensions. Adding a card does not change the tensor width. */
export const researchSchema: ResearchSchema = {
    version: RESEARCH_VERSION,
    context: [
        number('turn', 12), number('active'), number('first'),
        ...vocabulary('phase', ['dice', 'initiative', 'opening', 'mulligan', 'playing'], 'equals'),
        number('pending.actor'), number('pending.amount', 10), number('pending.hp', 10), number('pending.count', 10),
    ],
    player: [
        number('side'), number('points', 12), number('maxPoints', 12), number('pp', 12), number('maxPp', 12),
        number('turns', 12), number('nextPpDebt', 4), number('handCount', 10),
        number('yojoCount', 20), number('sweetCount', 10), bool('shield'),
        length('played', 30), length('milestones', 2),
        ...['mp', 'ice', 'acorns', 'sweetBoost', 'entryBuff', 'discardedYojo', 'skipDraw', 'mochidaLeft']
            .map(key => number(`resources.${key}`, 10)),
    ],
    card: [
        number('side'),
        ...vocabulary('zone', ['hand', 'field', 'nap', 'exile', 'choice'], 'equals'),
        ...vocabulary('definition.type', ['yojo', 'sweet', 'playable', 'gimmick'], 'equals'),
        ...vocabulary('definition.fruit', ['strawberry', 'grape', 'melon', 'orange', 'common'], 'equals'),
        number('definition.cost', 12), number('definition.attack', 10), number('definition.hp', 10),
        number('definition.evasion', 6), number('definition.actionsPerTurn', 3), number('definition.maxDamage', 10),
        bool('definition.unharmedAttacking'), bool('definition.revealable'), bool('definition.variableCost'),
        ...vocabulary('definition.coverage', ['unannotated', 'partial', 'complete'], 'equals'),
        ...vocabulary('definition.keywords', keywords, 'contains'),
        ...vocabulary('definition.hooks', ['onPlay', 'onEnter', 'afterPlay', 'onDestroyed', 'onAttack', 'onDefend',
            'onTurnStart', 'onTurnEnd', 'onAllyEnter', 'onOwnerPlayed', 'onDrawn', 'onDiscarded', 'onReveal',
            'onExiled', 'onEvade', 'onHealed', 'onSkill', 'onAttackEnd', 'onCombatDamage', 'onAttackKill'], 'contains'),
        ...['cost', 'attack', 'hp', 'damage', 'attackBonus', 'hpBonus', 'costDelta', 'temporaryCost']
            .map(key => number(`current.${key}`, key.includes('Cost') || key === 'cost' || key === 'costDelta' ? 12 : 10)),
        ...['exhausted', 'enteredThisTurn', 'immobile', 'shield', 'hiding', 'silenced', 'revealed'].map(key => bool(`current.${key}`)),
        number('current.evasion', 6), number('current.actions', 3), length('current.links', 5),
        number('current.entered', 12), number('current.ateOn', 12), number('current.immobileUntil', 12), number('current.owner'),
        ...vocabulary('current.keywords', keywords, 'contains'),
        ...vocabulary('current.fruits', ['strawberry', 'grape', 'melon', 'orange'], 'contains'),
    ],
    effect: [
        ...vocabulary('trigger', ['onPlay', 'onDestroyed', 'onAttack', 'onOwnerPlayed', 'onTurnStart', 'onTurnEnd'], 'equals'),
        ...vocabulary('operation', ['damage', 'draw', 'heal', 'steal', 'reduce', 'buff', 'shield', 'summon', 'keyword'], 'equals'),
        ...vocabulary('target', ['self.unit', 'self.units', 'self.leader', 'self', 'enemy.unit', 'enemy.units', 'enemy.leader'], 'equals'),
        ...vocabulary('selection', ['one', 'all', 'random'], 'equals'),
        number('amount', 10), number('hp', 10),
        ...vocabulary('keyword', keywords, 'equals'),
        ...vocabulary('condition.kind', ['played', 'turn', 'resource'], 'equals'),
        number('condition.threshold', 10), length('condition.cards', 5),
    ],
    action: [
        number('cost.pp', 12), number('cost.mp', 10), number('cost.acorns', 10),
        ...vocabulary('type', ['roll', 'initiative', 'openingDraw', 'mulligan', 'keep', 'play', 'attack', 'end',
            'choose', 'skill', 'exSkill', 'acorn', 'reveal'], 'equals'),
        bool('targetLeader'), number('index', 10), length('cards', 10),
        ...vocabulary('deck', ['yojo', 'sweet'], 'equals'),
        ...vocabulary('mode', ['draw', 'pp'], 'equals'),
        ...vocabulary('order', ['first', 'second'], 'equals'),
    ],
};
