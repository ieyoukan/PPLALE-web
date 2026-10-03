// Generic effect steps shared by many cards. Card-only steps are declared next to the card.
import { scriptOf } from '../cards/registry.ts';
import type { OpTable } from '../cards/types.ts';
import { isRealSweet } from '../core/cards.ts';
import { applyEnterAuras, draw, enterField, FIELD_SIZE } from '../core/zones.ts';
import { deckLabel } from '../model.ts';
import type { DeckKind, Task } from '../model.ts';
import { cardContext } from './context.ts';
import { unitsInScope } from './targets.ts';

/** Numbers on a step are multiplied by おいしくなる呪文. Target counts are not. */
const amount = (t: Task) => (t.amount ?? 0) * (t.multiplier ?? 1);
const hp = (t: Task) => (t.hp ?? 0) * (t.multiplier ?? 1);
const drawReason = (t: Task) => ({ opening: '最初の手札', turn: 'ターン開始', threshold: 'お菓子ポイント到達' } as Record<string, string>)[t.text ?? ''] ?? 'カード効果';

export const genericOps: OpTable = {
    // ── Units (選択した幼女1人) ──
    damage: {
        target: 'unit',
        run(fx, t) {
            fx.damage(t.target!, amount(t));
            // Multi-target damage: pick the next one from the original candidates.
            if ((t.count ?? 1) > 1) fx.next({ ...t, target: undefined, count: t.count! - 1, ids: [...(t.ids ?? []), t.target!] });
        },
    },
    buff: {
        target: 'unit',
        run(fx, t) {
            fx.buff(t.target!, amount(t), hp(t));
            if (t.keyword) fx.addKeyword(t.target!, t.keyword);
        },
    },
    keyword: { target: 'unit', run: (fx, t) => fx.addKeyword(t.target!, t.keyword!) },
    destroy: { target: 'unit', run: (fx, t) => fx.destroy(t.target!) },
    // FAQ ②-1: the copy is summoned even when the target survives destruction.
    copy: {
        target: 'unit',
        run(fx, t) {
            const cardId = fx.s.cards[t.target!].cardId;
            fx.destroy(t.target!);
            fx.summon(cardId);
        },
    },
    // Moves an enemy unit with its stat changes to the actor's field.
    stealUnit: {
        target: 'unit',
        run(fx, t) {
            if (fx.me.field.length >= FIELD_SIZE) return;
            fx.foe.field = fx.foe.field.filter(id => id !== t.target);
            enterField(fx.s, fx.side, t.target!, fx.catalog, false);
        },
    },

    // ── Units (全体・ランダム。挑発の対象集中なし) ──
    allDamage: { run: (fx, t) => [...unitsInScope(fx.s, t)].forEach(id => fx.damage(id, amount(t))) },
    allBuff: {
        run: (fx, t) => unitsInScope(fx.s, t).forEach(id => {
            fx.buff(id, amount(t), hp(t));
            if (t.keyword) fx.addKeyword(id, t.keyword);
        }),
    },
    randomDamage: {
        run(fx, t) {
            if (fx.foe.field.length) fx.damage(fx.foe.field[fx.random(fx.foe.field.length)], amount(t));
        },
    },
    summon: {
        run(fx, t) {
            for (let i = 0; i < (t.count ?? 1); i++) fx.summon(t.cardId!);
        },
    },
    /** Ally reactions to a unit played from hand, after its own on-play steps (FAQ). */
    enterAuras: { run: (fx, t) => applyEnterAuras(fx.s, t.actor, t.source!, fx.catalog) },

    // ── Sweet points / PP ──
    heal: { run: (fx, t) => fx.heal(amount(t)) },
    reduce: { run: (fx, t) => { fx.losePoints(t.scope === 'friendly' ? fx.side : fx.foeSide, amount(t), 'reduce'); } },
    steal: { run: (fx, t) => { fx.losePoints(fx.foeSide, amount(t), 'steal'); } },
    pp: { run: (fx, t) => fx.gainPp(amount(t)) },

    // ── Hand / deck ──
    addHand: { run: (fx, t) => { fx.me.hand.push(fx.spawn(t.cardId!)); } },
    /** One card at a time from a deck the player clicks. `count` × multiplier draws in total. */
    draw: {
        run(fx, t) {
            if (!t.target) {
                const kinds: DeckKind[] = t.deck ? [t.deck] : ['yojo', 'sweet'];
                fx.ask(`${drawReason(t)}：山札を押して1枚引いてください`, kinds.map(kind => ({ id: kind, label: `${deckLabel(kind)}デッキ（${fx.me[kind].length}枚）` })), t);
                return;
            }
            const kind = t.deck ?? t.target as DeckKind, uid = draw(fx.s, t.actor, kind);
            const drawn = [...(t.ids ?? []), ...(uid ? [uid] : [])];
            const total = (t.count ?? 1) * (t.multiplier ?? 1);
            if (total > 1) fx.next({ ...t, count: total - 1, target: undefined, ids: drawn, multiplier: 1 });
            const source = t.source && fx.s.cards[t.source];
            if (source) scriptOf(source.cardId).onDrawn?.(cardContext(fx.s, fx.catalog, t.actor, source.uid), { kind, uid, drawn, done: total <= 1 });
        },
    },
    /** Discard one card from hand. With an empty hand it does nothing and later steps continue. */
    discard: {
        run(fx, t) {
            if (!t.target) return fx.pick('捨てる手札を選んでください', fx.me.hand, t);
            fx.discard(t.target);
        },
    },
    /** Reveal a sweet in hand and change its cost; `text: 'temporary'` lasts until the turn ends. */
    handCost: {
        run(fx, t) {
            if (!t.target) return fx.pick('コストを変更するお菓子を選んでください', fx.me.hand.filter(id => isRealSweet(fx.catalog, fx.s.cards[id].cardId)), t);
            const card = fx.s.cards[t.target];
            card.revealed = true;
            if (t.text === 'temporary') card.temporaryCost += amount(t);
            else card.costDelta += amount(t);
        },
    },
};
