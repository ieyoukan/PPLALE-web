// Changes made by hand on the board in its edit mode (盤面エディタ): put any card anywhere, change a
// unit or a player, choose whose turn it is. Card uids stay the same, so the board keeps what it shows.
// The result is played after a round trip through `positionOf` / `buildPosition` (see position.ts).
import { scriptOf } from './cards/registry.ts';
import { hpOf, spawnCard } from './core/cards.ts';
import { cloneState } from './core/state.ts';
import { FIELD_SIZE } from './core/zones.ts';
import { MAX_PP, RuleError, sides } from './model.ts';
import type { Catalog, ExSkillId, ExSkillState, GameState, Keyword, Side } from './model.ts';
import { playableSkills, skillsFor } from './playables/skills.ts';

export type EditZone = 'field' | 'hand' | 'nap' | 'exile' | 'yojo' | 'sweet';
export type BoardEdit =
    /** A new card; `slot` on the field. Decks get it at the bottom unless `top`. */
    | { type: 'add'; side: Side; zone: EditZone; cardId: string; slot?: number; top?: boolean }
    | { type: 'remove'; uid: string }
    /** A unit back to its owner's hand, as a fresh card. */
    | { type: 'toHand'; uid: string }
    /** A unit to another empty slot of the same side. */
    | { type: 'move'; uid: string; slot: number }
    /** A unit card in hand onto an empty slot of its owner's field (no cost, no on-play effect). */
    | { type: 'toField'; uid: string; slot: number }
    /** A deck card to the top of its deck. */
    | { type: 'toTop'; uid: string }
    | { type: 'unit'; uid: string; attack?: number; hp?: number; damage?: number; keywords?: Keyword[]; fresh?: boolean; acted?: boolean; shield?: boolean; ate?: boolean; hiding?: boolean; evasion?: number; silenced?: boolean; fruitTypes?: string[] }
    | { type: 'handCard'; uid: string; cost?: number; revealed?: boolean; fruitTypes?: string[] }
    | { type: 'player'; side: Side; playable?: string; points?: number; maxPoints?: number; turns?: number; ppBonus?: number; pp?: number; skills?: number[]; shield?: boolean; sweetBoost?: number; skillHistory?: number[]; exSkills?: Partial<Record<ExSkillId, ExSkillState>>; ice?: number; acorns?: number; mochidaLeft?: number; skipDraw?: number }
    /** Cards played from hand earlier this game (conditions like うゆち / カフェオレ / ケーキ). */
    | { type: 'played'; side: Side; cardIds: string[] }
    | { type: 'deck'; side: Side; kind: 'yojo' | 'sweet'; cardIds: string[] }
    | { type: 'turn'; active?: Side; first?: Side };

const zones = ['field', 'hand', 'nap', 'exile', 'yojo', 'sweet'] as const;
const allowed: Record<EditZone, string[]> = {
    field: ['yojo'], hand: ['yojo', 'sweet', 'gimmick'], nap: ['yojo', 'sweet', 'gimmick'], exile: ['yojo', 'sweet', 'gimmick'], yojo: ['yojo'], sweet: ['sweet'],
};

function locate(s: GameState, uid: string): { side: Side; zone: EditZone } {
    for (const side of sides) {
        const zone = zones.find(z => s.players[side][z].includes(uid));
        if (zone) return { side, zone };
    }
    throw new RuleError('そのカードは盤面にありません');
}
const free = (s: GameState, side: Side, slot: number) => slot >= 0 && slot < FIELD_SIZE && !s.players[side].field.some(uid => s.cards[uid].slot === slot);

/** The board after one edit. Throws a RuleError (in words) for an edit that cannot be made. */
export function editGame(state: GameState, edit: BoardEdit, catalog: Catalog): GameState {
    const s = cloneState(state);
    switch (edit.type) {
        case 'add': {
            const def = catalog[edit.cardId], p = s.players[edit.side];
            if (!def || !allowed[edit.zone].includes(def.type)) throw new RuleError(`${def?.name ?? edit.cardId}はそこに置けません`);
            const uid = spawnCard(s, edit.cardId);
            if (edit.zone === 'field') {
                const slot = edit.slot ?? Array.from({ length: FIELD_SIZE }, (_, i) => i).find(i => free(s, edit.side, i));
                if (slot === undefined || !free(s, edit.side, slot)) throw new RuleError('その場所には置けません');
                Object.assign(s.cards[uid], { slot, entered: 0 });
                if (s.cards[uid].keywords.includes('hide')) s.cards[uid].hiding = true;
                p.field.push(uid);
            } else if (edit.top) p[edit.zone].unshift(uid);
            else p[edit.zone].push(uid);
            break;
        }
        case 'remove': {
            const { side, zone } = locate(s, edit.uid);
            s.players[side][zone] = s.players[side][zone].filter(id => id !== edit.uid);
            for (const card of Object.values(s.cards)) card.links = card.links.filter(id => id !== edit.uid);
            delete s.cards[edit.uid];
            break;
        }
        case 'toHand': {
            const { side, zone } = locate(s, edit.uid);
            if (zone !== 'field') throw new RuleError('場の幼女だけを手札に戻せます');
            const cardId = s.cards[edit.uid].cardId;
            const removed = editGame(s, { type: 'remove', uid: edit.uid }, catalog);
            removed.players[side].hand.push(spawnCard(removed, cardId));
            return removed;
        }
        case 'move': {
            const { side, zone } = locate(s, edit.uid);
            if (zone !== 'field' || !free(s, side, edit.slot)) throw new RuleError('その場所には動かせません');
            s.cards[edit.uid].slot = edit.slot;
            break;
        }
        case 'toField': {
            const { side, zone } = locate(s, edit.uid), card = s.cards[edit.uid];
            if (zone !== 'hand' || catalog[card.cardId].type !== 'yojo' || !free(s, side, edit.slot)) throw new RuleError('その場所には置けません');
            const p = s.players[side];
            p.hand = p.hand.filter(id => id !== edit.uid);
            p.field.push(edit.uid);
            Object.assign(card, { slot: edit.slot, entered: 0, exhausted: false, costDelta: 0, temporaryCost: 0, revealed: false });
            // As when it is put there: a かくれんぼ unit is hidden.
            if (card.keywords.includes('hide')) card.hiding = true;
            break;
        }
        case 'toTop': {
            const { side, zone } = locate(s, edit.uid);
            if (zone !== 'yojo' && zone !== 'sweet') throw new RuleError('山札のカードだけを一番上にできます');
            s.players[side][zone] = [edit.uid, ...s.players[side][zone].filter(id => id !== edit.uid)];
            break;
        }
        case 'unit': {
            if (locate(s, edit.uid).zone !== 'field') throw new RuleError('場の幼女を選んでください');
            const card = s.cards[edit.uid], printedHp = catalog[card.cardId].hp;
            if (edit.attack !== undefined) card.attackBonus = edit.attack;
            if (edit.hp !== undefined) card.hpBonus = Math.max(1 - printedHp, edit.hp);
            if (edit.damage !== undefined) card.damage = Math.max(0, edit.damage);
            // A unit on the field keeps at least 1 HP; at 0 it would already be gone.
            card.damage = Math.min(card.damage, Math.max(0, hpOf({ ...card, damage: 0 }, catalog) - 1));
            if (edit.keywords) {
                if (!card.keywords.includes('hide') && edit.keywords.includes('hide')) card.hiding = true;
                card.keywords = Array.from(new Set(edit.keywords));
            }
            if (edit.hiding !== undefined) card.hiding = edit.hiding;
            if (edit.evasion !== undefined) card.evasion = Math.max(-12, Math.min(6, edit.evasion));
            if (edit.silenced !== undefined) card.silenced = edit.silenced;
            if (edit.fruitTypes) card.fruitTypes = [...edit.fruitTypes];
            if (edit.fresh !== undefined) card.entered = edit.fresh ? s.turn : 0;
            if (edit.acted !== undefined) card.exhausted = edit.acted;
            if (edit.shield !== undefined) card.shield = edit.shield;
            if (edit.ate !== undefined) card.ateOn = edit.ate ? s.turn - 1 : -1;
            break;
        }
        case 'handCard': {
            if (locate(s, edit.uid).zone !== 'hand') throw new RuleError('手札のカードを選んでください');
            const card = s.cards[edit.uid];
            if (edit.cost !== undefined) card.costDelta = edit.cost;
            if (edit.revealed !== undefined) card.revealed = edit.revealed;
            if (edit.fruitTypes) card.fruitTypes = [...edit.fruitTypes];
            break;
        }
        case 'player': {
            const p = s.players[edit.side];
            if (edit.playable !== undefined) {
                if (!(edit.playable in playableSkills)) throw new RuleError('使えるプレイアブルを選んでください');
                p.playable = edit.playable;
                p.skills = skillsFor(p.playable).map(skill => skill.uses);
            }
            if (edit.maxPoints !== undefined) p.maxPoints = Math.max(1, edit.maxPoints);
            if (edit.points !== undefined) p.points = edit.points;
            p.points = Math.max(0, Math.min(p.maxPoints, p.points));
            // Thresholds at or above the points count as passed, as on a board built from a position.
            p.milestones = ([10, 5] as const).filter(threshold => p.points <= threshold);
            if (edit.turns !== undefined) p.turns = Math.max(0, Math.min(99, edit.turns));
            if (edit.ppBonus !== undefined) p.ppBonus = edit.ppBonus;
            p.ppBonus = Math.max(-p.turns, Math.min(MAX_PP - p.turns, p.ppBonus));
            if (edit.pp !== undefined) p.pp = Math.max(0, Math.min(MAX_PP, edit.pp));
            if (edit.skills) p.skills = skillsFor(p.playable).map((skill, i) => Math.max(0, Math.min(skill.uses, edit.skills![i] ?? p.skills[i])));
            if (edit.shield !== undefined) p.shield = edit.shield;
            if (edit.sweetBoost !== undefined) p.sweetBoost = Math.max(0, edit.sweetBoost);
            if (edit.skillHistory) p.skillHistory = [...edit.skillHistory];
            if (edit.exSkills) p.exSkills = Object.fromEntries(Object.entries(edit.exSkills).map(([id, skill]) => [id, { ...skill }]));
            for (const key of ['ice', 'acorns', 'mochidaLeft', 'skipDraw'] as const) if (edit[key] !== undefined) p[key] = Math.max(0, Math.min(999, edit[key]));
            break;
        }
        case 'played':
            s.players[edit.side].played = [...edit.cardIds];
            break;
        case 'deck': {
            const p = s.players[edit.side];
            for (const uid of p[edit.kind]) delete s.cards[uid];
            p[edit.kind] = edit.cardIds.filter(id => allowed[edit.kind].includes(catalog[id]?.type)).map(id => spawnCard(s, id));
            break;
        }
        case 'turn':
            if (edit.active !== undefined) s.active = edit.active;
            if (edit.first !== undefined) s.rules.firstPlayer = edit.first;
            break;
    }
    return s;
}

/** A unit's printed keywords, for showing which ones were added or taken away. */
export const printedKeywords = (cardId: string): Keyword[] => [...(scriptOf(cardId).keywords ?? [])];
