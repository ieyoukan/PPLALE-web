// Card instances and their current values (attack, HP, cost, keywords).
import { MAX_PP } from '../model.ts';
import { scriptFor, scriptOf } from '../cards/registry.ts';
import type { Catalog, GameState, Instance, Keyword, Side } from '../model.ts';
import { touch } from './movement.ts';

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
    touch(s, uid);
    const card = s.cards[uid];
    if (card && !card.keywords.includes(keyword)) card.keywords.push(keyword);
    if (card && keyword === 'hide') card.hiding = true;
    if (card && keyword === 'evade' && card.evasion === undefined) card.evasion = 5;
}

/**
 * おにごっこ(1d6≧X) given by an effect. A unit that already has one keeps the stronger (the lower X):
 * it holds both, and the stronger is the one that counts (ユーザー裁定).
 */
export function giveEvasion(s: GameState, uid: string, x: number) {
    const card = s.cards[uid];
    if (!card) return;
    addKeyword(s, uid, 'evade');
    card.evasion = Math.min(card.evasion ?? x, x);
}

/**
 * 行動不能 for a time: the unit cannot act up to the end of game turn `until`. A longer one already
 * running stays. It ends with that turn (commands/phases.ts) or when the unit leaves the field.
 */
export function immobilize(s: GameState, uid: string, until: number) {
    touch(s, uid);
    const card = s.cards[uid];
    if (card) card.immobileUntil = Math.max(card.immobileUntil ?? until, until);
}
/** Whether a 行動不能 given for a time stops the unit from acting in game turn `turn` (default: now). */
export const immobilized = (s: GameState, uid: string, turn = s.turn) => (s.cards[uid]?.immobileUntil ?? -1) >= turn;

export function buff(s: GameState, uid: string, attack: number, hp: number) {
    touch(s, uid);
    const card = s.cards[uid];
    if (!card) return;
    card.attackBonus += attack;
    card.hpBonus += hp;
}

/** Swaps current attack and HP without carrying damage over (ふろんとさん, ぎってぃ). At 0 attack it is left with 0 HP. */
export function swapStats(s: GameState, uid: string, catalog: Catalog) {
    touch(s, uid);
    const card = s.cards[uid];
    if (!card) return;
    const attack = attackOf(card, catalog), hp = hpOf(card, catalog);
    card.attackBonus = hp - catalog[card.cardId].attack;
    card.hpBonus = attack - catalog[card.cardId].hp;
    card.damage = 0;
}

/**
 * Deals damage. Effect damage is ignored by `effectImmune`; うぃまる's barrier absorbs any one hit;
 * a unit with a damage limit (もなか) never takes more than it at once.
 */
export function hit(s: GameState, uid: string, amount: number, byEffect = true) {
    touch(s, uid);
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

/** Ends the fruit types a unit only had until an earlier turn was over (レンス). */
export function expireTimed(s: GameState, uid: string) {
    const card = s.cards[uid];
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
/**
 * 「PPを回復する」: up to the PP this turn may hold (最大PP), and ダブルダガー adds 2 on the owner's turn.
 * 「使用できるPPを増やす」 is `increasePp`.
 */
export function gainPp(s: GameState, side: Side, amount: number) {
    const p = s.players[side];
    const dagger = p.exSkills?.dagger;
    if (amount > 0 && s.active === side && dagger) {
        if (dagger.lastTurn !== s.turn) { dagger.lastTurn = s.turn; dagger.usedThisTurn = 0; }
        if ((dagger.usedThisTurn ?? 0) < 2) { amount += 2; dagger.usedThisTurn = (dagger.usedThisTurn ?? 0) + 1; }
    }
    // A recovery stops at the 最大PP but never takes away PP already above it (「PPを増やす」).
    p.pp = Math.max(p.pp, Math.min(availablePpMaximum(s, side), p.pp + amount));
}

/** 「PPを増やす」 (どんぐり, ストラの前借り, さおちゃん): goes past the 最大PP, and ダブルダガー does not apply. */
export function increasePp(s: GameState, side: Side, amount: number) {
    s.players[side].pp += amount;
}

export function costOf(s: GameState, uid: string, catalog: Catalog, side: Side) {
    const card = s.cards[uid];
    const base = scriptFor(s, uid).baseCost?.(s, side) ?? catalog[card.cardId].cost;
    return Math.max(0, base + card.costDelta + card.temporaryCost);
}

/** A sweet that counts as お菓子 for effects (back menus do not). */
export const isRealSweet = (catalog: Catalog, cardId: string) => catalog[cardId]?.type === 'sweet' && !['back_menu', 'currency'].includes(catalog[cardId].sweetType ?? '') && cardId !== 's_38';
