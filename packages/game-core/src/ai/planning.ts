// Evaluation for multi-action plans. Hand/deck values are estimates, never deck-top predictions.
import { scriptOf } from '../cards/registry.ts';
import { attackOf, costOf, hpOf, isRealSweet, maxPp } from '../core/cards.ts';
import { other } from '../model.ts';
import type { Catalog, DeckKind, GameState, Side } from '../model.ts';
import { defaultWeights, evaluate, WIN } from './evaluate.ts';

const planWeights = {
    ...defaultWeights,
    unitAttack: 4.2, unitHp: 2.5, defender: 4, danger: 7, pierce: 3, quick: 0.2, skill: 0.6,
};
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const average = (values: number[]) => values.length ? sum(values) / values.length : 0;

function unitValue(s: GameState, uid: string, catalog: Catalog) {
    const c = s.cards[uid];
    return attackOf(c, catalog) * planWeights.unitAttack + Math.max(0, hpOf(c, catalog)) * planWeights.unitHp;
}

/** Marginal value of another copy of a sweet's effect, in this position. */
function sweetValue(s: GameState, side: Side, uid: string, catalog: Catalog): number {
    const p = s.players[side], enemy = s.players[other(side)], id = s.cards[uid].cardId;
    const friendly = p.field.length || Math.min(2, p.hand.filter(card => catalog[s.cards[card].cardId].type === 'yojo').length);
    const cakeKinds = new Set([...p.played, id].filter(cardId => catalog[cardId]?.sweetType === 'cake')).size;
    const healing = (n: number) => Math.min(n, Math.max(0, p.maxPoints - p.points)) * 7;
    const damageTo = (target: string, n: number) => {
        const c = s.cards[target];
        if (c.keywords.includes('effectImmune') || c.shield) return 0;
        return hpOf(c, catalog) <= n ? unitValue(s, target, catalog) : Math.min(n, hpOf(c, catalog)) * 2.5;
    };
    const damage = (n: number) => Math.max(0, ...enemy.field.map(target => damageTo(target, n)));
    const allDamage = (n: number) => sum(enemy.field.map(target => damageTo(target, n)));
    const buff = (n: number) => friendly ? n * 6.7 : 0;
    switch (id) {
        case 's_6': case 's_7': return damage(3) + (p.played.includes(id === 's_6' ? 's_7' : 's_6') ? 7 : 0);
        case 's_8': return allDamage(3);
        case 's_9': return damage(p.played.includes('s_10') ? 6 : 2);
        case 's_10': return p.played.includes('s_9') ? allDamage(2) : damage(2);
        case 's_15': return buff(1) + (cakeKinds >= 3 ? 10 : 0);
        case 's_16': return buff(cakeKinds >= 3 ? 3 : 1);
        case 's_17': return buff(1) * (cakeKinds >= 3 ? friendly : 1);
        case 's_18': return 12 + healing(2);
        case 's_19': return healing(3) + (p.shield ? 0 : 8);
        case 's_20': return buff(4) + (friendly ? 4 : 0);
        case 's_21': return 18 + healing(2);
        case 's_22': return Math.min(7, enemy.points) * 10 + healing(7);
        case 's_24': return buff(1) * friendly;
        default: return catalog[s.cards[uid].cardId].sweetType === 'doughnut' ? buff(1) : 0;
    }
}

function handValue(s: GameState, side: Side, uid: string, catalog: Catalog, impact: (uid: string) => number): number {
    const p = s.players[side], card = s.cards[uid], def = catalog[card.cardId];
    // Temporary discounts and borrowed PP cannot be saved for the next turn.
    const nextPp = Math.max(0, Math.min(12, maxPp(s, side) + 1) - p.nextPpDebt);
    const futureCost = Math.max(0, costOf(s, uid, catalog, side) - card.temporaryCost);
    const ready = futureCost <= nextPp ? 0.28 : 0.09;
    if (def.type === 'yojo') {
        const script = scriptOf(card.cardId);
        return (unitValue(s, uid, catalog) + (script.onDestroyed ? 3 : 0) + (card.keywords.includes('fast') ? 3 : 0)) * ready;
    }
    return Math.min(30, impact(uid)) * ready + (card.cardId === 's_24' && card.revealed ? 0.3 : 0);
}

/** Duplicate sweets share effect estimates; their individual costs are still evaluated separately. */
function estimates(s: GameState, side: Side, catalog: Catalog) {
    const sweets = new Map<string, number>();
    const impact = (uid: string) => {
        const id = s.cards[uid].cardId;
        let value = sweets.get(id);
        if (value === undefined) { value = sweetValue(s, side, uid, catalog); sweets.set(id, value); }
        return value;
    };
    return { impact, hand: (uid: string) => handValue(s, side, uid, catalog, impact) };
}

/** Chance of finding a specific card in one draw, plus cards already available. */
function access(s: GameState, side: Side, id: string, includeField = true) {
    const p = s.players[side];
    if ([...p.hand, ...(includeField ? p.field : [])].some(uid => s.cards[uid].cardId === id)) return 1;
    const deck = id.startsWith('y_') ? p.yojo : p.sweet;
    return deck.length ? 0.35 * deck.filter(uid => s.cards[uid].cardId === id).length / deck.length : 0;
}

function combinations(s: GameState, side: Side, catalog: Catalog, impact: (uid: string) => number): number {
    const p = s.players[side];
    let value = 7 * Math.min(access(s, side, 'y_15', false), access(s, side, 'y_16'));
    const availableSweets = [...p.hand, ...p.sweet];
    for (const type of ['cake', 'animal_soda', 'float']) {
        const played = new Set(p.played.filter(id => catalog[id]?.sweetType === type));
        const missing = new Set(availableSweets.map(uid => s.cards[uid].cardId)
            .filter(id => catalog[id]?.sweetType === type && !played.has(id)));
        value += Math.min(3, played.size) * sum([...missing].map(id => access(s, side, id))) * 2;
    }
    // Do not reward a spell without a compatible follow-up. Boosts persist across turns.
    if (p.sweetBoost) {
        const compatible = (uid: string) => isRealSweet(catalog, s.cards[uid].cardId)
            && catalog[s.cards[uid].cardId].sweetType !== 'animal_soda';
        const inHand = Math.max(0, ...p.hand.filter(compatible).map(impact));
        const inDeck = average(p.sweet.filter(compatible).map(impact));
        value += p.sweetBoost * Math.min(35, Math.max(inHand * 0.65, inDeck * 0.15));
    }
    // A cheap unit linked to a valuable enemy can become a useful sacrifice.
    const enemies = s.players[other(side)].field;
    for (const uid of p.field) {
        const linked = s.cards[uid].links.filter(id => enemies.includes(id));
        if (linked.length) value += (sum(linked.map(id => unitValue(s, id, catalog))) - unitValue(s, uid, catalog)) * 0.18;
    }
    return value;
}

function resources(s: GameState, side: Side, catalog: Catalog): number {
    const p = s.players[side];
    const estimate = estimates(s, side, catalog);
    let value = sum(p.hand.map(estimate.hand)) + combinations(s, side, catalog, estimate.impact);
    value -= p.nextPpDebt * 3;
    if (s.active === side) {
        // Spendable PP is only useful with follow-ups: this keeps preparation in the beam.
        const demand = sum(p.hand.map(uid => costOf(s, uid, catalog, side)));
        value += Math.min(p.pp, demand) * 0.9;
    }
    // Remaining deck contents guide future draws; their order is irrelevant.
    value += average(p.yojo.map(estimate.hand)) * 0.25;
    value += average(p.sweet.map(estimate.hand)) * 0.25;
    return value;
}

/** Visible attack pressure. Actual trades, guards, shields and lethal are resolved in the search. */
function pressure(s: GameState, side: Side, catalog: Catalog): number {
    const p = s.players[side], enemy = s.players[other(side)];
    const guarded = enemy.field.some(uid => s.cards[uid].keywords.includes('guard'));
    const attacks = p.field.flatMap(uid => {
        const c = s.cards[uid];
        if (c.keywords.includes('immobile') || c.keywords.includes('noEat')) return [];
        if (s.active === side && (c.exhausted || c.entered === s.turn && !c.keywords.includes('fast'))) return [];
        const face = !guarded || c.keywords.includes('pierce') ? attackOf(c, catalog) : 0;
        const extra = c.cardId === 'y_20' ? 2 : 0;
        return face + extra > 0 ? [face + extra] : [];
    });
    return Math.max(0, sum(attacks) - (enemy.shield && attacks.length ? Math.min(...attacks) : 0));
}

/** A balance of point advantage, surviving board, usable cards and combo readiness. */
export function evaluatePlan(s: GameState, side: Side, catalog: Catalog): number {
    if (s.winner === 'draw') return 0;
    if (s.winner === side) return WIN;
    if (s.winner === other(side)) return -WIN;
    const foe = other(side);
    const danger = (victim: Side) => {
        const damage = pressure(s, other(victim), catalog), points = s.players[victim].points;
        return damage >= points ? 90 + (damage - points) * 8 : Math.max(0, damage - points + 3) * 4;
    };
    return evaluate(s, side, catalog, planWeights)
        + resources(s, side, catalog) - resources(s, foe, catalog)
        + danger(foe) - danger(side);
}

/** Expected value of a draw from a known deck composition, without inspecting its top card. */
export function drawValue(s: GameState, side: Side, deck: DeckKind, catalog: Catalog): number {
    const p = s.players[side];
    if (!p[deck].length) return -Infinity;
    const estimate = estimates(s, side, catalog);
    const units = p.hand.filter(uid => catalog[s.cards[uid].cardId].type === 'yojo').length;
    const needUnits = p.field.length + units < 2 ? 8 : units === 0 ? 3 : 0;
    const sweets = p.hand.filter(uid => isRealSweet(catalog, s.cards[uid].cardId)).length;
    const source = s.pending?.task.actor === side && s.pending.task.source ? s.cards[s.pending.task.source].cardId : undefined;
    let drawEffect = 0;
    if (source === 'y_6' && deck === 'yojo') drawEffect = 4.2;
    if (source === 'y_8' && deck === 'sweet') drawEffect = 5;
    if (source === 'y_27' && deck === 'yojo' && (s.pending?.task.ids ?? []).every(uid => catalog[s.cards[uid].cardId].type === 'yojo')) drawEffect = 1;
    if (source === 's_18') drawEffect = deck === 'yojo' ? 10 : p.points < p.maxPoints ? 7 : 0;
    return average(p[deck].map(uid => estimate.hand(uid)
        + (s.cards[uid].cardId === 'y_15' ? 7 * access(s, side, 'y_16') : 0)
        + (s.cards[uid].cardId === 'y_16' ? 7 * access(s, side, 'y_15', false) : 0)))
        + drawEffect + (deck === 'yojo' ? needUnits : sweets === 0 ? 6 : sweets < 2 ? 2 : 0);
}

/** Optimistic ordering only; a pending effect must still be resolved before a plan is scored. */
export function orderPlan(s: GameState, side: Side, catalog: Catalog, score = evaluatePlan(s, side, catalog)): number {
    const task = s.pending?.task;
    const progress = task && task.actor === side && !['discard', 'trimHand', 'gift', 'diceDiscard'].includes(task.op) ? 8 : 0;
    return score + progress;
}
