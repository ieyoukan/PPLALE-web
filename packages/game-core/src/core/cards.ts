// Card instances and their current values (attack, HP, cost, keywords).
import { scriptOf } from '../cards/registry.ts';
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
}

export function buff(s: GameState, uid: string, attack: number, hp: number) {
    const card = s.cards[uid];
    if (!card) return;
    card.attackBonus += attack;
    card.hpBonus += hp;
}

/** Deals damage. Effect damage is ignored by `effectImmune`; うぃまる's barrier absorbs any one hit. */
export function hit(s: GameState, uid: string, amount: number, byEffect = true) {
    const card = s.cards[uid];
    if (!card || amount <= 0 || byEffect && card.keywords.includes('effectImmune')) return;
    if (card.shield) {
        card.shield = false;
        return;
    }
    card.damage += amount;
}

export function maxPp(s: GameState, side: Side) {
    const p = s.players[side];
    return Math.max(0, Math.min(s.rules.maxPP, p.turns + p.ppBonus));
}
export function gainPp(s: GameState, side: Side, amount: number) {
    const p = s.players[side];
    p.pp = Math.min(maxPp(s, side), p.pp + amount);
}

export function costOf(s: GameState, uid: string, catalog: Catalog, side: Side) {
    const card = s.cards[uid];
    const base = scriptOf(card.cardId).baseCost?.(s, side) ?? catalog[card.cardId].cost;
    return Math.max(0, base + card.costDelta + card.temporaryCost);
}

/** A sweet that counts as お菓子 for effects (back menus do not). */
export const isRealSweet = (catalog: Catalog, cardId: string) => catalog[cardId]?.type === 'sweet' && catalog[cardId].sweetType !== 'back_menu';
