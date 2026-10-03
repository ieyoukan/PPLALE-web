// ふつう: the original rule-of-thumb CPU. Card-specific judgement comes from the scripts' `cpu` hints.
import { scriptOf } from '../../cards/registry.ts';
import { attackOf, costOf, hpOf } from '../../core/cards.ts';
import { cardContext, effects } from '../../effects/context.ts';
import { opDef } from '../../effects/resolve.ts';
import { other } from '../../model.ts';
import type { Catalog, Command, GameState, Side } from '../../model.ts';
import { skillsFor } from '../../playables/skills.ts';
import type { Move } from '../moves.ts';
import type { CpuDecision, CpuStrategy } from '../types.ts';

type Of<T extends Command['type']> = Extract<Command, { type: T }>;
const of = <T extends Command['type']>(moves: Move[], type: T) => moves.filter((m): m is Move & { command: Of<T> } => m.command.type === type);
const yojoInHand = (s: GameState, side: Side, catalog: Catalog) => s.players[side].hand.filter(id => catalog[s.cards[id].cardId].type === 'yojo').length;

export const normal: CpuStrategy = {
    level: 'normal',
    name: 'ふつう',
    description: 'カードごとの定石で手堅く動きます',
    choose(d) {
        const { state: s, moves } = d;
        if (s.pending) return choose(d);
        switch (s.phase) {
            case 'opening': return byDeck(d, preferredDeck(d, 'opening'));
            case 'initiative': return of(moves, 'initiative').find(m => m.command.order === 'first') ?? moves[0];
            case 'mulligan': return mulligan(d);
            case 'playing': return mainPhase(d);
            default: return moves[0];
        }
    },
};

/** Opening: yojo until two are in hand. Effect draws: sweets once two yojo are in hand. */
function preferredDeck({ state: s, side, catalog }: CpuDecision, when: 'opening' | 'effect') {
    const p = s.players[side], yojo = yojoInHand(s, side, catalog);
    if (when === 'opening') return p.yojo.length && yojo < 2 ? 'yojo' : p.sweet.length ? 'sweet' : 'yojo';
    return p.sweet.length && yojo >= 2 ? 'sweet' : p.yojo.length ? 'yojo' : 'sweet';
}
function byDeck({ moves }: CpuDecision, deck: string) {
    return moves.find(m => m.command.type === 'openingDraw' && m.command.deck === deck || m.command.type === 'choose' && m.command.option === deck) ?? moves[0];
}

/** Exchange opening cards costing 4 or more, each back to its own deck. */
function mulligan({ state: s, side, catalog, moves }: CpuDecision) {
    const heavy = s.mulligan.eligible[side].filter(id => s.players[side].hand.includes(id) && catalog[s.cards[id].cardId].cost >= 4);
    if (!heavy.length) return of(moves, 'keep')[0] ?? moves[0];
    return of(moves, 'mulligan').find(m => m.command.replacements.length === heavy.length
        && m.command.replacements.every(r => heavy.includes(r.uid) && r.deck === catalog[s.cards[r.uid].cardId].type)) ?? moves[0];
}

function mainPhase(d: CpuDecision): Move {
    const { state: s, side, catalog, moves } = d;
    const p = s.players[side], enemy = s.players[other(side)];
    const attacks = of(moves, 'attack');
    // Finish a won position before spending more resources.
    const lethal = attacks.find(m => m.command.target === 'leader' && attackOf(s.cards[m.command.uid], catalog) >= enemy.points && !enemy.shield);
    if (lethal) return lethal;
    // The most expensive card that is worth playing now.
    const plays = of(moves, 'play')
        .filter(m => scriptOf(s.cards[m.command.uid].cardId).cpu?.worthPlaying?.(cardContext(s, catalog, side, m.command.uid)) ?? true)
        .sort((a, b) => costOf(s, b.command.uid, catalog, side) - costOf(s, a.command.uid, catalog, side));
    if (plays.length) return plays[0];
    const fx = effects(s, catalog, side);
    const skill = of(moves, 'skill').find(m => skillsFor(p.playable)[m.command.index].cpu?.(fx));
    if (skill) return skill;
    // Each unit in field order: the sweets if possible, otherwise the weakest enemy.
    for (const uid of p.field) {
        const own = attacks.filter(m => m.command.uid === uid);
        const leader = own.find(m => m.command.target === 'leader');
        if (leader) return leader;
        const unit = own.sort((a, b) => hpOf(s.cards[a.command.target], catalog) - hpOf(s.cards[b.command.target], catalog))[0];
        if (unit) return unit;
    }
    return of(moves, 'end')[0] ?? moves[0];
}

function choose(d: CpuDecision): Move {
    const { state: s, side, catalog, moves } = d;
    const options = of(moves, 'choose');
    const { task } = s.pending!;
    const ids = options.map(m => m.command.option);
    let preferred = opDef(task.op)?.cpu?.(effects(s, catalog, side, task.source), task, ids);
    if (task.op === 'draw') preferred = preferredDeck(d, 'effect');
    if (task.op === 'keyword' && task.keyword === 'charge')
        preferred = ids.find(id => s.cards[id]?.entered === s.turn && !s.cards[id].keywords.includes('charge'));
    // Otherwise rank card options: harmful steps pick the best enemy, discards the cheapest card.
    const harmful = ['damage', 'destroy', 'stealUnit'].includes(task.op);
    const discarding = ['discard', 'diceDiscard', 'gift', 'doughnut'].includes(task.op);
    const score = (id: string) => {
        const c = s.cards[id];
        if (!c) return 0;
        if (harmful) {
            const lethal = task.op !== 'damage' || hpOf(c, catalog) <= (task.amount ?? 0) * (task.multiplier ?? 1);
            return (c.keywords.includes('effectImmune') ? -100 : 0) + (lethal ? 20 : 0) + (c.keywords.includes('taunt') || c.keywords.includes('guard') ? 10 : 0) + attackOf(c, catalog);
        }
        if (discarding) return -costOf(s, id, catalog, side);
        return attackOf(c, catalog);
    };
    return options.find(m => m.command.option === preferred)
        ?? [...options].sort((a, b) => score(b.command.option) - score(a.command.option))[0]
        ?? moves[0];
}
