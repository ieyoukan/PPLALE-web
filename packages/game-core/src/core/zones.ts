// Moving cards between deck, hand, field and nap, and the triggers those moves cause.
import { scriptFor, scriptOf } from '../cards/registry.ts';
import { cardContext } from '../effects/context.ts';
import { deckLabel, other, sides } from '../model.ts';
import type { Catalog, DeckKind, GameState, Side } from '../model.ts';
import { markAction } from './stall.ts';
import { addKeyword, buff, hpOf, note, recordEffectBlock, spawnCard } from './cards.ts';
import { shuffled } from './rng.ts';

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

/**
 * A card in a hand is shown to both players. Every reveal goes through here, whatever caused it (the
 * reveal button, a search 「公開状態で手札に加える」, あみのの参謀 …), so 「このカードが公開されたとき」 fires once.
 */
export function reveal(s: GameState, uid: string, catalog: Catalog) {
    const card = s.cards[uid];
    if (!card || card.revealed) return;
    card.revealed = true;
    const side = sides.find(side => s.players[side].hand.includes(uid));
    if (side !== undefined) scriptFor(s, uid).onReveal?.(cardContext(s, catalog, side, uid));
}

/** Hand → nap. Triggers 「手札から直接お昼寝場所に捨てられたとき」. */
export function discard(s: GameState, side: Side, uid: string, catalog: Catalog) {
    const p = s.players[side];
    p.hand = p.hand.filter(id => id !== uid);
    p.nap.push(uid);
    s.cards[uid].costDelta = 0;
    s.cards[uid].temporaryCost = 0;
    if (catalog[s.cards[uid].cardId].type === 'yojo') {
        p.discardedYojo = (p.discardedYojo ?? 0) + 1;
        // 神隠し ようじょ贄: in the turn it was used, each 幼女 its owner discards steals 2 (人数×2).
        if (s.active === side && p.exSkills?.kamikakushi?.lastTurn === s.turn) s.queue.push({ op: 'steal', actor: side, amount: 2 });
    }
    scriptFor(s, uid).onDiscarded?.(cardContext(s, catalog, side, uid));
}

/**
 * What a unit has only while it is on the field: lost effects (りくす), keywords and おにごっこ given
 * by effects, かくれんぼ, the one-time barrier, ポッキーの links (on both cards), the actions it took
 * this turn, and what it was given for a limited time (行動不能, a fruit type). Cleared once
 * it has left — after its own leaving triggers, which still see the state it left with.
 */
export function clearFieldState(s: GameState, uid: string) {
    const card = s.cards[uid], script = scriptOf(card.cardId);
    for (const partner of card.links) if (s.cards[partner]) s.cards[partner].links = s.cards[partner].links.filter(id => id !== uid);
    Object.assign(card, { silenced: false, keywords: [...(script.keywords ?? [])], hiding: false, shield: false, links: [] });
    if (script.evasion !== undefined) card.evasion = script.evasion;
    else delete card.evasion;
    delete card.actions;
    delete card.immobileUntil;
    delete card.timedFruits;
}

/** 行動不能 until the end of game turn `until`. A unit that is 行動不能 without a limit stays so. */
export function immobilize(s: GameState, uid: string, until: number) {
    const card = s.cards[uid];
    if (!card || ownerOnField(s, uid) === undefined) return;
    if (card.keywords.includes('immobile') && card.immobileUntil === undefined) return;
    addKeyword(s, uid, 'immobile');
    card.immobileUntil = Math.max(card.immobileUntil ?? 0, until);
}

/**
 * A card in a hand, on the field or in a nap goes back into its owner's deck (幼女 or お菓子, by its
 * type) as the printed card again; that deck is then shuffled.
 */
export function toDeck(s: GameState, uid: string, catalog: Catalog) {
    const side = sides.find(side => (['hand', 'field', 'nap'] as const).some(zone => s.players[side][zone].includes(uid)));
    if (side === undefined) return;
    const p = s.players[side], card = s.cards[uid], kind: DeckKind = catalog[card.cardId].type === 'sweet' ? 'sweet' : 'yojo';
    if (p.field.includes(uid)) leaveField(s, side, uid);
    for (const zone of ['hand', 'nap'] as const) p[zone] = p[zone].filter(id => id !== uid);
    clearFieldState(s, uid);
    Object.assign(card, { attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0, revealed: false });
    p[kind] = shuffled(s, [...p[kind], uid]);
    note(s, `${catalog[card.cardId].name}を${deckLabel(kind)}デッキへ戻しました`);
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
    const fromField = p.field.includes(uid);
    if (fromField) leaveField(s, side, uid);
    for (const zone of ['hand', 'nap', 'yojo', 'sweet'] as const) p[zone] = p[zone].filter(id => id !== uid);
    p.exile.push(uid);
    scriptFor(s, uid).onExiled?.(cardContext(s, catalog, side, uid));
    if (fromField) clearFieldState(s, uid);
}

export function bounce(s: GameState, uid: string, catalog: Catalog) {
    const side = ownerOnField(s, uid);
    if (side === undefined) return;
    leaveField(s, side, uid);
    const c = s.cards[uid];
    Object.assign(c, { attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0, revealed: false });
    // Back in hand it is the printed card again: its on-play effects work when it is played again (FAQ④-1).
    clearFieldState(s, uid);
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
    delete card.actions;
    if (card.keywords.includes('hide')) card.hiding = true;
    s.players[side].field.push(uid);
    // ビデカメ: 「このゲーム中、自分の場に出た幼女すべてを+1/+1する」, however the unit arrives.
    const boost = s.players[side].entryBuff ?? 0;
    if (boost) buff(s, uid, boost, boost);
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

/** `silenced`: 「全ての能力を失った状態で場に出す」 — no keywords, and its script does not run even as it enters. */
export function summon(s: GameState, side: Side, cardId: string, catalog: Catalog, silenced = false): string | undefined {
    if (s.players[side].field.length >= FIELD_SIZE) {
        note(s, '場がいっぱいのため登場できません');
        return;
    }
    const uid = spawnCard(s, cardId);
    if (silenced) {
        Object.assign(s.cards[uid], { silenced: true, keywords: [] });
        delete s.cards[uid].evasion;
    }
    enterField(s, side, uid, catalog, false);
    return uid;
}

/**
 * Field → nap, or where the card says it goes instead (もちだ: out of the game; いのむー・まこぽに: back
 * into the 幼女デッキ). `byEffect` destruction is ignored by `effectImmune`. Linked units follow.
 */
export function destroy(s: GameState, uid: string, byEffect: boolean, catalog: Catalog) {
    const side = ownerOnField(s, uid);
    if (side === undefined) return;
    const card = s.cards[uid];
    if (byEffect && (card.keywords.includes('effectImmune') || card.keywords.includes('destroyImmune'))) {
        recordEffectBlock(s, uid, 'destroy');
        return;
    }
    const p = s.players[side], to = scriptFor(s, uid).destroyedTo;
    leaveField(s, side, uid);
    card.costDelta = 0;
    card.temporaryCost = 0;
    p[to === 'exile' ? 'exile' : to === 'deck' ? 'yojo' : 'nap'].push(uid);
    note(s, `${catalog[card.cardId].name}が${to === 'exile' ? '破壊され、除外' : to === 'deck' ? '破壊され、幼女デッキ' : 'お昼寝場所'}へ`);
    for (const linked of card.links) destroy(s, linked, true, catalog);
    scriptFor(s, uid).onDestroyed?.(cardContext(s, catalog, side, uid));
    const abyss = p.exSkills?.abyss;
    if (abyss && abyss.uses > 0) { abyss.uses--; s.queue.push({ op: 'reduce', actor: side, amount: 1 }); }
    for (const enemy of s.players[other(side)].field) {
        if (s.cards[enemy].cardId === 'y_147' && !s.cards[enemy].silenced) s.queue.push({ op: 'reduce', actor: other(side), source: enemy, amount: 1 });
    }
    // Lost effects end with the unit leaving the field: in the nap it is the printed card again.
    clearFieldState(s, uid);
    if (to === 'deck') {
        Object.assign(card, { attackBonus: 0, hpBonus: 0, damage: 0 });
        p.yojo = shuffled(s, p.yojo);
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
