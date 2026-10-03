// A deterministic, lightweight opponent. It uses the same commands as the UI; card-specific
// judgement comes from the scripts' `cpu` hints.
import { scriptOf } from './cards/registry.ts';
import { applyCommand } from './commands/index.ts';
import { attackOf, costOf, hpOf } from './core/cards.ts';
import { canAttack } from './core/combat.ts';
import { FIELD_SIZE } from './core/zones.ts';
import { cardContext, effects } from './effects/context.ts';
import { opDef } from './effects/resolve.ts';
import { other } from './model.ts';
import type { Catalog, Command, GameState, Side } from './model.ts';
import { skillsFor } from './playables/skills.ts';

const yojoInHand = (s: GameState, side: Side, catalog: Catalog) => s.players[side].hand.filter(id => catalog[s.cards[id].cardId].type === 'yojo').length;

export function cpuCommand(s: GameState, catalog: Catalog): Command | null {
    if (s.winner !== null || s.phase === 'dice') return null;
    const actor: Side = s.phase === 'opening' ? s.openingRemaining[1] > 0 ? 1 : 0
        : s.phase === 'mulligan' ? !s.mulligan.confirmed[1] ? 1 : 0
        : s.pending?.task.actor ?? s.active;
    const p = s.players[actor], enemy = s.players[other(actor)];
    if (s.phase === 'opening') {
        const deck = p.yojo.length && yojoInHand(s, actor, catalog) < 2 ? 'yojo' : p.sweet.length ? 'sweet' : 'yojo';
        return s.openingRemaining[actor] > 0 ? { type: 'openingDraw', actor, deck } : null;
    }
    if (s.phase === 'initiative') return { type: 'initiative', actor, order: 'first' };
    if (s.pending) return choose(s, actor, catalog);
    if (s.phase === 'mulligan') {
        const replacements = s.mulligan.eligible[actor]
            .filter(id => p.hand.includes(id) && catalog[s.cards[id].cardId].cost >= 4)
            .map(uid => ({ uid, deck: catalog[s.cards[uid].cardId].type as 'yojo' | 'sweet' }));
        return replacements.length ? { type: 'mulligan', actor, replacements } : { type: 'keep', actor };
    }
    // Finish a won position before spending more resources.
    for (const uid of p.field)
        if (canAttack(s, actor, uid, 'leader', catalog) && attackOf(s.cards[uid], catalog) >= enemy.points && !enemy.shield)
            return { type: 'attack', actor, uid, target: 'leader' };
    const playable = p.hand.filter(uid => {
        if (costOf(s, uid, catalog, actor) > p.pp || catalog[s.cards[uid].cardId].type === 'yojo' && p.field.length >= FIELD_SIZE) return false;
        return scriptOf(s.cards[uid].cardId).cpu?.worthPlaying?.(cardContext(s, catalog, actor, uid)) ?? true;
    }).sort((a, b) => costOf(s, b, catalog, actor) - costOf(s, a, catalog, actor));
    if (playable.length) return { type: 'play', actor, uid: playable[0] };
    const fx = effects(s, catalog, actor);
    for (const [index, skill] of Array.from(skillsFor(p.playable).entries())) {
        if (!p.skills[index] || skill.cost > p.pp || !skill.cpu?.(fx)) continue;
        const command: Command = { type: 'skill', actor, index };
        if (!applyCommand(s, command, catalog).error) return command;
    }
    for (const uid of p.field) {
        if (canAttack(s, actor, uid, 'leader', catalog)) return { type: 'attack', actor, uid, target: 'leader' };
        const targets = enemy.field.filter(target => canAttack(s, actor, uid, target, catalog)).sort((a, b) => hpOf(s.cards[a], catalog) - hpOf(s.cards[b], catalog));
        if (targets.length) return { type: 'attack', actor, uid, target: targets[0] };
    }
    return { type: 'end', actor };
}

function choose(s: GameState, actor: Side, catalog: Catalog): Command | null {
    const { options, task } = s.pending!;
    const p = s.players[actor];
    const ids = options.map(o => o.id);
    let preferred = opDef(task.op)?.cpu?.(effects(s, catalog, actor, task.source), task, ids);
    if (task.op === 'draw') preferred = p.sweet.length && yojoInHand(s, actor, catalog) >= 2 ? 'sweet' : p.yojo.length ? 'yojo' : 'sweet';
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
        if (discarding) return -costOf(s, id, catalog, actor);
        return attackOf(c, catalog);
    };
    const option = (preferred && ids.includes(preferred) ? preferred : undefined) ?? [...ids].sort((a, b) => score(b) - score(a))[0];
    return option ? { type: 'choose', actor, option } : null;
}
