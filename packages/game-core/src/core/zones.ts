// Moving cards between deck, hand, field and nap, and the triggers those moves cause.
import { scriptOf } from '../cards/registry.ts';
import { cardContext } from '../effects/context.ts';
import { deckLabel, other, sides } from '../model.ts';
import type { Catalog, DeckKind, GameState, Side } from '../model.ts';
import { hpOf, note, spawnCard } from './cards.ts';

export const FIELD_SIZE = 7;

export function ownerOnField(s: GameState, uid: string): Side | undefined {
    return sides.find(side => s.players[side].field.includes(uid));
}

export function openSlot(s: GameState, side: Side): number {
    const used = s.players[side].field.map(id => s.cards[id].slot);
    return Array.from({ length: FIELD_SIZE }, (_, index) => index).find(index => !used.includes(index)) ?? -1;
}

export function draw(s: GameState, side: Side, kind: DeckKind): string | undefined {
    const p = s.players[side], uid = p[kind].shift();
    if (uid) {
        p.hand.push(uid);
        note(s, `${p.name}：${deckLabel(kind)}を1枚ドロー`);
    } else {
        note(s, `${p.name}：${deckLabel(kind)}デッキが空です`);
        if (s.rules.emptyDeckLoses) s.winner = other(side);
    }
    return uid;
}

/** Hand → nap. Triggers 「手札から直接お昼寝場所に捨てられたとき」. */
export function discard(s: GameState, side: Side, uid: string, catalog: Catalog) {
    const p = s.players[side];
    p.hand = p.hand.filter(id => id !== uid);
    p.nap.push(uid);
    scriptOf(s.cards[uid].cardId).onDiscarded?.(cardContext(s, catalog, side, uid));
}

/**
 * Puts a unit on the field.
 * - From hand: its on-play effect is queued first, ally reactions (とここ etc.) after it, per FAQ.
 * - Otherwise (summon / steal / copy): ally reactions apply immediately; no on-play effect.
 */
export function enterField(s: GameState, side: Side, uid: string, catalog: Catalog, fromHand: boolean, slot = openSlot(s, side)) {
    const card = s.cards[uid];
    Object.assign(card, { slot, entered: s.turn, exhausted: false });
    s.players[side].field.push(uid);
    const ctx = cardContext(s, catalog, side, uid);
    scriptOf(card.cardId).onEnter?.(ctx);
    if (fromHand) {
        scriptOf(card.cardId).onPlay?.(ctx);
        s.queue.push({ op: 'enterAuras', actor: side, source: uid });
    } else {
        applyEnterAuras(s, side, uid, catalog);
    }
}

export function applyEnterAuras(s: GameState, side: Side, uid: string, catalog: Catalog) {
    if (!s.players[side].field.includes(uid)) return;
    for (const friend of s.players[side].field.filter(id => id !== uid)) {
        scriptOf(s.cards[friend].cardId).onAllyEnter?.(cardContext(s, catalog, side, friend), uid);
    }
}

export function summon(s: GameState, side: Side, cardId: string, catalog: Catalog): string | undefined {
    if (s.players[side].field.length >= FIELD_SIZE) {
        note(s, '場がいっぱいのため登場できません');
        return;
    }
    const uid = spawnCard(s, cardId);
    enterField(s, side, uid, catalog, false);
    return uid;
}

/** Field → nap. `byEffect` destruction is ignored by `effectImmune`. Linked units follow. */
export function destroy(s: GameState, uid: string, byEffect: boolean, catalog: Catalog) {
    const side = ownerOnField(s, uid);
    if (side === undefined) return;
    const card = s.cards[uid];
    if (byEffect && card.keywords.includes('effectImmune')) return;
    const p = s.players[side];
    p.field = p.field.filter(id => id !== uid);
    card.slot = null;
    p.nap.push(uid);
    note(s, `${catalog[card.cardId].name}がお昼寝場所へ`);
    for (const linked of card.links) destroy(s, linked, true, catalog);
    scriptOf(card.cardId).onDestroyed?.(cardContext(s, catalog, side, uid));
}

/**
 * Removes units at 0 HP and decides the winner. The active side's units go first, oldest first
 * (field order is entry order), so their destruction triggers resolve first.
 */
export function settle(s: GameState, catalog: Catalog) {
    for (const side of [s.active, other(s.active)]) {
        for (const uid of [...s.players[side].field]) {
            if (hpOf(s.cards[uid], catalog) <= 0) destroy(s, uid, false, catalog);
        }
    }
    const lost = sides.filter(side => s.players[side].points <= 0);
    if (lost.length) s.winner = lost.length === 2 ? 'draw' : other(lost[0]);
}
