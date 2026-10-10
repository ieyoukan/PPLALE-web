// Card instances and their current values (attack, HP, cost, keywords).
import { MAX_PP } from '../model.ts';
import { scriptFor, scriptOf } from '../cards/registry.ts';
import type { Catalog, GameState, Instance, Keyword, Side } from '../model.ts';

export function note(s: GameState, text: string) {
    s.log.push(text);
    if (s.log.length > 100) s.log.shift();
}

/** Creates a fresh instance with the card's printed keywords. Does not place it in any zone. */
export function spawnCard(s: GameState, cardId: string): string {
    const uid = `c${++s.serial}`;
    s.cards[uid] = {
        uid, cardId, attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0,
        keywords: [...(scriptOf(cardId).keywords ?? [])], shield: false, slot: null,
        entered: -1, exhausted: false, ateOn: -1, revealed: false, links: [],
        ...(scriptOf(cardId).evasion ? { evasion: scriptOf(cardId).evasion } : {}),
    };
    return uid;
}

export const attackOf = (card: Instance, catalog: Catalog) => Math.max(0, catalog[card.cardId].attack + card.attackBonus);
export const hpOf = (card: Instance, catalog: Catalog) => catalog[card.cardId].hp + card.hpBonus - card.damage;
export const hasKeyword = (s: GameState, uid: string, keyword: Keyword) => !!s.cards[uid]?.keywords.includes(keyword);

/** Adds a keyword once. Keywords do not stack. */
export function addKeyword(s: GameState, uid: string, keyword: Keyword) {
    const card = s.cards[uid];
    if (card && !card.keywords.includes(keyword)) card.keywords.push(keyword);
    if (card && keyword === 'hide') card.hiding = true;
    if (card && keyword === 'evade' && card.evasion === undefined) card.evasion = 5;
}

export function buff(s: GameState, uid: string, attack: number, hp: number) {
    const card = s.cards[uid];
    if (!card) return;
    card.attackBonus += attack;
    card.hpBonus += hp;
}

/** Swaps a unit's current attack and HP (ふろんとさん, ぎってぃ). At 0 attack it is left with 0 HP. */
export function swapStats(s: GameState, uid: string, catalog: Catalog) {
    const card = s.cards[uid];
    if (!card) return;
    const attack = attackOf(card, catalog), hp = hpOf(card, catalog);
    card.attackBonus = hp - catalog[card.cardId].attack;
    card.hpBonus += attack - hp;
}

/**
 * Deals damage. Effect damage is ignored by `effectImmune`; うぃまる's barrier absorbs any one hit;
 * a unit with a damage limit (もなか) never takes more than it at once.
 */
export function hit(s: GameState, uid: string, amount: number, byEffect = true) {
    const card = s.cards[uid];
    if (!card || amount <= 0) return;
    if (byEffect && card.keywords.includes('effectImmune')) {
        recordEffectBlock(s, uid, 'damage');
        return;
    }
    if (card.shield) {
        card.shield = false;
        return;
    }
    card.damage += Math.min(amount, scriptFor(s, uid).maxDamage ?? amount);
}

/** Ends what a unit only had until an earlier turn was over: 行動不能 for some turns, a fruit type for a while. */
export function expireTimed(s: GameState, uid: string) {
    const card = s.cards[uid];
    if (card.immobileUntil !== undefined && card.immobileUntil < s.turn) {
        card.keywords = card.keywords.filter(k => k !== 'immobile');
        delete card.immobileUntil;
    }
    if (!card.timedFruits) return;
    const kept = Object.entries(card.timedFruits).filter(([, until]) => until >= s.turn);
    if (kept.length) card.timedFruits = Object.fromEntries(kept);
    else delete card.timedFruits;
}

export function recordEffectBlock(s: GameState, uid: string, kind: 'damage' | 'destroy') {
    const revision = s.revision + 1;
    const events = s.effectBlocks?.revision === revision ? s.effectBlocks.events : [];
    s.effectBlocks = { revision, events: [...events, { uid, kind }] };
    note(s, `効果耐性：${kind === 'damage' ? 'ダメージ' : '破壊'}を無効化`);
}

export function maxPp(s: GameState, side: Side) {
    const p = s.players[side];
    return Math.max(0, Math.min(MAX_PP, p.turns + p.ppBonus));
}
/** Spendable ceiling this turn; the temporary second-player bonus does not trigger max-PP effects. */
export function availablePpMaximum(s: GameState, side: Side) {
    return Math.min(MAX_PP, maxPp(s, side) + s.players[side].turnPpBonus);
}
export function gainPp(s: GameState, side: Side, amount: number) {
    const p = s.players[side];
    const dagger = p.exSkills?.dagger;
    if (amount > 0 && s.active === side && dagger) {
        if (dagger.lastTurn !== s.turn) { dagger.lastTurn = s.turn; dagger.usedThisTurn = 0; }
        if ((dagger.usedThisTurn ?? 0) < 2) { amount += 2; dagger.usedThisTurn = (dagger.usedThisTurn ?? 0) + 1; }
    }
    p.pp = Math.min(availablePpMaximum(s, side), p.pp + amount);
}

export function costOf(s: GameState, uid: string, catalog: Catalog, side: Side) {
    const card = s.cards[uid];
    const base = scriptFor(s, uid).baseCost?.(s, side) ?? catalog[card.cardId].cost;
    return Math.max(0, base + card.costDelta + card.temporaryCost);
}

/** A sweet that counts as お菓子 for effects (back menus do not). */
export const isRealSweet = (catalog: Catalog, cardId: string) => catalog[cardId]?.type === 'sweet' && !['back_menu', 'currency'].includes(catalog[cardId].sweetType ?? '') && cardId !== 's_38';
