import { applyCommand, attackOf, canAttack, costOf, hpOf, maxPp } from './engine.ts';
import { other, skillsFor } from './model.ts';
import type { Catalog, Command, GameState } from './model.ts';
/** A deterministic, lightweight opponent. It uses the same commands as the UI. */
export function cpuCommand(s: GameState, catalog: Catalog): Command | null {
    if (s.winner !== null || s.phase === 'dice')
        return null;
    const actor = s.phase === 'opening' ? s.openingRemaining[1] > 0 ? 1 : 0 : s.phase === 'mulligan' ? !s.mulligan.confirmed[1] ? 1 : 0 : s.pending?.task.actor ?? s.active;
    if (s.phase === 'opening') {
        const p = s.players[actor];
        const deck = p.yojo.length && p.hand.filter(id => catalog[s.cards[id].cardId].type === 'yojo').length < 2 ? 'yojo' : p.sweet.length ? 'sweet' : 'yojo';
        return s.openingRemaining[actor] > 0 ? { type: 'openingDraw', actor, deck } : null;
    }
    if (s.phase === 'initiative') return { type: 'initiative', actor, order: 'first' };
    const p = s.players[actor], enemy = s.players[other(actor)];
    if (s.pending) {
        const { options, task } = s.pending;
        let preferred: string | undefined;
        if (task.op === 'draw') {
            preferred = p.sweet.length && p.hand.filter(id => catalog[s.cards[id].cardId].type === 'yojo').length >= 2 ? 'sweet' : p.yojo.length ? 'yojo' : 'sweet';
        }
        else if (task.op === 'shurei')
            preferred = enemy.field.length >= 3 ? 'all' : 'two';
        else if (task.op === 'float')
            preferred = 'skip';
        else if (task.op === 'bonusDamage')
            preferred = p.pp >= 1 ? 'yes' : 'no';
        else if (task.op === 'punish' && enemy.field.filter(id => s.cards[id].ateOn === s.turn - 1).length > 1)
            preferred = 'all';
        else if (task.op === 'keyword' && task.keyword === 'charge')
            preferred = options.find(o => s.cards[o.id]?.entered === s.turn && !s.cards[o.id].keywords.includes('charge'))?.id;
        const ranked = [...options].sort((a, b) => {
            const ca = s.cards[a.id], cb = s.cards[b.id];
            if (!ca || !cb)
                return 0;
            if (['damage', 'destroy', 'stealUnit'].includes(task.op)) {
                const score = (id: string) => {
                    const c = s.cards[id];
                    const lethal = task.op !== 'damage' || hpOf(c, catalog) <= (task.amount ?? 0) * (task.multiplier ?? 1);
                    return (c.keywords.includes('effectImmune') ? -100 : 0) + (lethal ? 20 : 0) + (c.keywords.includes('taunt') || c.keywords.includes('guard') ? 10 : 0) + attackOf(c, catalog);
                };
                return score(b.id) - score(a.id);
            }
            if (['discardThen', 'diceDiscard', 'gift', 'doughnut'].includes(task.op))
                return costOf(s, a.id, catalog, actor) - costOf(s, b.id, catalog, actor);
            return attackOf(cb, catalog) - attackOf(ca, catalog);
        });
        const option = options.find(o => o.id === preferred) ?? ranked[0];
        return option ? { type: 'choose', actor, option: option.id } : null;
    }
    if (s.phase === 'mulligan') {
        const replacements = s.mulligan.eligible[actor].filter(id => p.hand.includes(id) && catalog[s.cards[id].cardId].cost >= 4).map(uid => ({ uid, deck: catalog[s.cards[uid].cardId].type as 'yojo' | 'sweet' }));
        return replacements.length ? { type: 'mulligan', actor, replacements } : { type: 'keep', actor };
    }
    // Finish a won position before spending more resources.
    for (const uid of p.field)
        if (canAttack(s, actor, uid, 'leader', catalog) && attackOf(s.cards[uid], catalog) >= enemy.points && !enemy.shield)
            return { type: 'attack', actor, uid, target: 'leader' };
    const hand = p.hand.filter(uid => {
        const id = s.cards[uid].cardId, card = catalog[id];
        if (costOf(s, uid, catalog, actor) > p.pp || (card.type === 'yojo' && p.field.length >= 7))
            return false;
        if (['s_6', 's_7', 's_8', 's_9', 's_10'].includes(id) && !enemy.field.length)
            return false;
        if (['s_11', 's_12', 's_13', 's_14', 's_15', 's_16', 's_17', 's_20', 's_24'].includes(id) && !p.field.length)
            return false;
        if (id === 's_23' && (!p.field.length || !enemy.field.length))
            return false;
        if (id === 's_19' && p.points === p.maxPoints && p.shield)
            return false;
        return true;
    }).sort((a, b) => costOf(s, b, catalog, actor) - costOf(s, a, catalog, actor));
    if (hand.length)
        return { type: 'play', actor, uid: hand[0] };
    const skills = skillsFor(p.playable);
    for (const [index, skill] of Array.from(skills.entries())) {
        if (!p.skills[index] || skill.cost > p.pp)
            continue;
        let useful = false;
        if (index === 0)
            useful = enemy.field.length > 0 && p.field.some(id => s.cards[id].entered === s.turn && !s.cards[id].exhausted && !s.cards[id].keywords.some(k => ['charge', 'fast', 'immobile'].includes(k)));
        else if (p.playable === 'p_0')
            useful = index === 2 ? maxPp(s, actor) >= 7 : maxPp(s, actor) < s.rules.maxPP;
        else if (p.playable === 'p_1')
            useful = enemy.field.length > 0;
        else if (p.playable === 'p_2')
            useful = p.hand.some(id => costOf(s, id, catalog, actor) > p.pp && costOf(s, id, catalog, actor) <= p.pp + 2);
        else if (p.playable === 'p_3')
            useful = index === 3 || p.points < p.maxPoints;
        else if (p.playable === 'p_4')
            useful = index === 1 ? p.field.length > 0 : enemy.field.some(id => s.cards[id].ateOn === s.turn - 1);
        else if (p.playable === 'p_5')
            useful = index === 1 ? enemy.field.length > 0 && p.field.length < 7 && p.points > 2 : p.yojo.length > 0;
        const command: Command = { type: 'skill', actor, index };
        if (useful && !applyCommand(s, command, catalog).error)
            return command;
    }
    for (const uid of p.field) {
        if (canAttack(s, actor, uid, 'leader', catalog))
            return { type: 'attack', actor, uid, target: 'leader' };
        const targets = enemy.field.filter(target => canAttack(s, actor, uid, target, catalog)).sort((a, b) => hpOf(s.cards[a], catalog) - hpOf(s.cards[b], catalog));
        if (targets.length)
            return { type: 'attack', actor, uid, target: targets[0] };
    }
    return { type: 'end', actor };
}
