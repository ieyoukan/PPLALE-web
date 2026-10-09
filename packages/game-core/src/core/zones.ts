// Moving cards between deck, hand, field and nap, and the triggers those moves cause.
import { scriptFor } from '../cards/registry.ts';
import { cardContext } from '../effects/context.ts';
import { deckLabel, other, sides } from '../model.ts';
import type { Catalog, DeckKind, GameState, Side } from '../model.ts';
import { markAction } from './stall.ts';
import { hpOf, note, recordEffectBlock, spawnCard } from './cards.ts';

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
        markAction(s);
        note(s, `${p.name}：${deckLabel(kind)}を1枚ドロー`);
    } else {
        note(s, `${p.name}：${deckLabel(kind)}デッキが空です`);
    }
    return uid;
}

/** Hand → nap. Triggers 「手札から直接お昼寝場所に捨てられたとき」. */
export function discard(s: GameState, side: Side, uid: string, catalog: Catalog) {
    const p = s.players[side];
    p.hand = p.hand.filter(id => id !== uid);
    p.nap.push(uid);
    s.cards[uid].costDelta = 0;
    s.cards[uid].temporaryCost = 0;
    scriptFor(s, uid).onDiscarded?.(cardContext(s, catalog, side, uid));
}

export function leaveField(s: GameState, side: Side, uid: string) {
    s.players[side].field = s.players[side].field.filter(id => id !== uid);
    s.cards[uid].slot = null;
    if (s.cards[uid].cardId === 'token_mochida') s.players[side].mochidaLeft = (s.players[side].mochidaLeft ?? 0) + 1;
}

/** Effect exile from any zone, with separate triggers from discarding or hand-limit removal. */
export function exile(s: GameState, uid: string, catalog: Catalog, owner?: Side) {
    const side = owner ?? sides.find(side => ['field', 'hand', 'nap', 'yojo', 'sweet'].some(zone => s.players[side][zone as 'field'].includes(uid)));
    if (side === undefined) return;
    const p = s.players[side];
    if (p.nap.includes(uid) && s.cards[uid].cardId === 'y_146' && !s.cards[uid].silenced) return;
    if (p.field.includes(uid)) leaveField(s, side, uid);
    for (const zone of ['hand', 'nap', 'yojo', 'sweet'] as const) p[zone] = p[zone].filter(id => id !== uid);
    p.exile.push(uid);
    scriptFor(s, uid).onExiled?.(cardContext(s, catalog, side, uid));
}

export function bounce(s: GameState, uid: string, catalog: Catalog) {
    const side = ownerOnField(s, uid);
    if (side === undefined) return;
    leaveField(s, side, uid);
    const c = s.cards[uid];
    Object.assign(c, { attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0, revealed: false, shield: false, hiding: false });
    s.players[side].hand.push(uid);
    note(s, `${catalog[c.cardId].name}を手札へ戻しました`);
}

/**
 * Puts a unit on the field.
 * - From hand: its on-play effect is queued first, ally reactions (とここ etc.) after it, per FAQ.
 * - Otherwise (summon / steal / copy): ally reactions apply immediately; no on-play effect.
 */
export function enterField(s: GameState, side: Side, uid: string, catalog: Catalog, fromHand: boolean, slot = openSlot(s, side)) {
    const card = s.cards[uid];
    Object.assign(card, { slot, entered: s.turn, exhausted: false });
    card.destroyedBy = undefined;
    if (card.keywords.includes('hide')) card.hiding = true;
    s.players[side].field.push(uid);
    const ctx = cardContext(s, catalog, side, uid);
    scriptFor(s, uid).onEnter?.(ctx);
    if (fromHand) {
        scriptFor(s, uid).onPlay?.(ctx);
        s.queue.push({ op: 'enterAuras', actor: side, source: uid });
    } else {
        applyEnterAuras(s, side, uid, catalog);
    }
}

export function applyEnterAuras(s: GameState, side: Side, uid: string, catalog: Catalog) {
    if (!s.players[side].field.includes(uid)) return;
    for (const friend of s.players[side].field.filter(id => id !== uid)) {
        scriptFor(s, friend).onAllyEnter?.(cardContext(s, catalog, side, friend), uid);
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
    if (byEffect && (card.keywords.includes('effectImmune') || card.keywords.includes('destroyImmune'))) {
        recordEffectBlock(s, uid, 'destroy');
        return;
    }
    const p = s.players[side];
    leaveField(s, side, uid);
    card.costDelta = 0;
    card.temporaryCost = 0;
    if (card.cardId === 'token_mochida' && !card.silenced) p.exile.push(uid);
    else p.nap.push(uid);
    note(s, `${catalog[card.cardId].name}がお昼寝場所へ`);
    for (const linked of card.links) destroy(s, linked, true, catalog);
    scriptFor(s, uid).onDestroyed?.(cardContext(s, catalog, side, uid));
    const abyss = p.exSkills?.abyss;
    if (abyss && abyss.uses > 0) { abyss.uses--; s.queue.push({ op: 'reduce', actor: side, amount: 1 }); }
    for (const enemy of s.players[other(side)].field) {
        if (s.cards[enemy].cardId === 'y_147' && !s.cards[enemy].silenced) s.queue.push({ op: 'reduce', actor: other(side), source: enemy, amount: 1 });
    }
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
    // There is no draw: when both reach 0 in the same step the second player wins, as in the stall rule's tie.
    if (lost.length) s.winner = lost.length === 2 ? other(s.rules.firstPlayer) : other(lost[0]);
}
