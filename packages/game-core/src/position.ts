// A board written by hand (盤面エディタ): which cards are where, points, PP and skill uses, and whose
// turn it is. It becomes a playing GameState to play on, or to ask the CPU what the best move is
// (like a 詰将棋). It is also the share code a player sends with a report.
import { z } from 'zod';
import { scriptOf } from './cards/registry.ts';
import { hpOf, note, spawnCard } from './core/cards.ts';
import { keywords, MAX_PP, sandboxRules, sides } from './model.ts';
import type { Catalog, GameState, Keyword, Player, Side } from './model.ts';
import { playableSkills, skillsFor } from './playables/skills.ts';
import { FIELD_SIZE } from './core/zones.ts';

/** A unit on the field. Omitted values are the printed / untouched ones. */
export interface PositionUnit {
    id: string;
    /** Changes to the printed attack / HP (+1/+1 → attack 1, hp 1). */
    attack?: number;
    hp?: number;
    damage?: number;
    /** All its keywords. Omitted: the printed ones. */
    keywords?: Keyword[];
    /** Entered this turn (cannot attack yet without 突撃 / 早食い). */
    fresh?: boolean;
    /** Already attacked this turn. */
    acted?: boolean;
    /** うぃまる's one-time damage barrier. */
    shield?: boolean;
    /** Ate sweets in the previous turn (りくす, おしおき). */
    ate?: boolean;
}
export interface PositionHandCard {
    id: string;
    /** Permanent cost change (ぷぷりえーる, おうたあそび …). */
    cost?: number;
    revealed?: boolean;
}
export interface PositionSide {
    playable: string;
    points: number;
    maxPoints: number;
    /** This side's own turns so far (the 「nターン目」). */
    turns: number;
    maxPp: number;
    pp: number;
    /** Remaining uses per skill (common skill first). Omitted: all unused. */
    skills?: number[];
    /** By slot, 7 at most; null is an empty slot. */
    field: (PositionUnit | null)[];
    hand: (string | PositionHandCard)[];
    nap: string[];
    exile?: string[];
    /** Deck tops first. */
    yojo: string[];
    sweet: string[];
    /** Cards played from hand earlier this game, oldest first (うゆち, カフェオレ, ケーキの種類 …). */
    played?: string[];
    /** ふわふわパンケーキ */
    shield?: boolean;
    /** おいしくなる呪文 waiting for the next sweet. */
    sweetBoost?: number;
}
export interface Position {
    version: 1;
    /** Whose turn it is. */
    active: Side;
    /** Who went first (decides 後攻5ターン目 and who wins a tie). */
    first: Side;
    players: [PositionSide, PositionSide];
    title?: string;
    note?: string;
}

const count = z.number().int().nonnegative().max(999);
const delta = z.number().int().min(-99).max(99);
const id = z.string().max(40);
const ids = z.array(id).max(60);
const unit = z.object({
    id, attack: delta.optional(), hp: delta.optional(), damage: count.optional(),
    keywords: z.array(z.enum(keywords as [Keyword, ...Keyword[]])).max(keywords.length).optional(),
    fresh: z.boolean().optional(), acted: z.boolean().optional(), shield: z.boolean().optional(), ate: z.boolean().optional(),
});
const handCard = z.union([id, z.object({ id, cost: delta.optional(), revealed: z.boolean().optional() })]);
const sideSchema = z.object({
    playable: id, points: count, maxPoints: count, turns: count, maxPp: count, pp: count,
    skills: z.array(count).max(8).optional(), field: z.array(unit.nullable()).max(FIELD_SIZE), hand: z.array(handCard).max(60),
    nap: ids, exile: ids.optional(), yojo: ids, sweet: ids, played: ids.optional(), shield: z.boolean().optional(), sweetBoost: count.optional(),
});
const schema = z.object({
    version: z.literal(1), active: z.union([z.literal(0), z.literal(1)]), first: z.union([z.literal(0), z.literal(1)]),
    players: z.tuple([sideSchema, sideSchema]), title: z.string().max(80).optional(), note: z.string().max(2000).optional(),
});

/** Parses an untrusted value (a decoded share code, a saved board). Null when it is not a position. */
export function parsePosition(value: unknown): Position | null {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data as Position : null;
}

const handId = (card: string | PositionHandCard) => typeof card === 'string' ? card : card.id;
const label = (side: Side) => side === 0 ? '手前' : '奥';

/** What is wrong with a position, in words for the editor. Empty when it can be played. */
export function checkPosition(position: Position, catalog: Catalog): string[] {
    const errors: string[] = [];
    position.players.forEach((p, index) => {
        const side = label(index as Side);
        if (!(p.playable in playableSkills)) errors.push(`${side}：通常プレイアブルを選んでください`);
        const known = (cardId: string, place: string, types: string[]) => {
            const def = catalog[cardId];
            if (!def) errors.push(`${side}の${place}：${cardId} というカードはありません`);
            else if (!types.includes(def.type)) errors.push(`${side}の${place}：${def.name}は置けません`);
        };
        p.field.forEach(u => { if (u) known(u.id, '場', ['yojo']); });
        p.hand.forEach(card => known(handId(card), '手札', ['yojo', 'sweet', 'gimmick']));
        [...p.nap, ...(p.exile ?? [])].forEach(cardId => known(cardId, 'お昼寝場所', ['yojo', 'sweet', 'gimmick']));
        p.yojo.forEach(cardId => known(cardId, '幼女デッキ', ['yojo']));
        p.sweet.forEach(cardId => known(cardId, 'お菓子デッキ', ['sweet']));
        if (p.maxPoints < 1) errors.push(`${side}：お菓子の最大値は1以上にしてください`);
        if (p.points > p.maxPoints) errors.push(`${side}：お菓子が最大値を超えています`);
        if (p.maxPp > MAX_PP) errors.push(`${side}：最大PPは${MAX_PP}までです`);
        if (p.pp > MAX_PP) errors.push(`${side}：PPは${MAX_PP}までです`);
        if (index === position.active && p.turns < 1) errors.push(`${side}：手番の側は1ターン目以降にしてください`);
        const skills = p.playable in playableSkills ? skillsFor(p.playable) : [];
        p.skills?.forEach((left, i) => { if (skills[i] && left > skills[i].uses) errors.push(`${side}：${skills[i].name}の残り回数は${skills[i].uses}回までです`); });
        p.field.forEach(u => {
            const def = u && catalog[u.id];
            if (u && def && def.hp + (u.hp ?? 0) - (u.damage ?? 0) <= 0) errors.push(`${side}の場：${def.name}のHPが0以下です`);
        });
    });
    return errors;
}

/**
 * A match in the playing phase at this position. Thresholds (10 / 5) at or above the current points
 * count as already passed. Throws with the reasons from `checkPosition` when it cannot be played.
 */
export function buildPosition(position: Position, catalog: Catalog, { names = ['手前', '奥'], seed = 1 }: { names?: [string, string]; seed?: number } = {}): GameState {
    const errors = checkPosition(position, catalog);
    if (errors.length) throw new Error(errors.join(' / '));
    const [a, b] = position.players;
    // The turn counter ticks for both sides; it only has to tell this turn from the previous one.
    const turn = Math.max(2, a.turns + b.turns);
    const players = position.players.map((p, index): Player => ({
        name: names[index], yojo: [], sweet: [], hand: [], field: [], nap: [], exile: [], playable: p.playable,
        points: p.points, maxPoints: p.maxPoints, turns: p.turns, pp: p.pp, ppBonus: p.maxPp - p.turns, turnPpBonus: 0, nextPpDebt: 0,
        milestones: ([10, 5] as const).filter(threshold => p.points <= threshold), played: [...(p.played ?? [])],
        shield: !!p.shield, sweetBoost: p.sweetBoost ?? 0,
        skills: skillsFor(p.playable).map((skill, i) => Math.min(skill.uses, p.skills?.[i] ?? skill.uses)), lastBorrow: -10,
    })) as [Player, Player];
    const s: GameState = {
        version: 1, effectTauntRules: true, turnRules: true, phase: 'playing', openingRemaining: [0, 0],
        mulligan: { eligible: [[], []], confirmed: [true, true] }, dice: null,
        rules: { ...sandboxRules, firstPlayer: position.first }, rng: seed >>> 0, serial: 0, revision: 0,
        active: position.active, turn, players, cards: {}, queue: [], pending: null, winner: null, log: [],
        stall: { acted: false, idleTurns: 0 },
    };
    for (const side of sides) {
        const from = position.players[side], p = s.players[side];
        const spawn = (cardId: string) => spawnCard(s, cardId);
        p.hand = from.hand.map(card => {
            const uid = spawn(handId(card));
            if (typeof card !== 'string') Object.assign(s.cards[uid], { costDelta: card.cost ?? 0, revealed: !!card.revealed });
            return uid;
        });
        from.field.forEach((u, slot) => {
            if (!u) return;
            const uid = spawn(u.id);
            Object.assign(s.cards[uid], {
                slot, attackBonus: u.attack ?? 0, hpBonus: u.hp ?? 0, damage: u.damage ?? 0,
                keywords: [...(u.keywords ?? scriptOf(u.id).keywords ?? [])],
                entered: u.fresh ? turn : 0, exhausted: !!u.acted, shield: !!u.shield, ateOn: u.ate ? turn - 1 : -1,
            });
            p.field.push(uid);
        });
        p.nap = from.nap.map(spawn);
        p.exile = (from.exile ?? []).map(spawn);
        p.yojo = from.yojo.map(spawn);
        p.sweet = from.sweet.map(spawn);
    }
    note(s, position.title ? `盤面「${position.title}」から開始` : '作った盤面から開始');
    return s;
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/** The position of a match in play, for editing it or sharing it. Effects waiting to resolve are dropped. */
export function positionOf(s: GameState, catalog: Catalog): Position {
    const ids = (uids: string[]) => uids.map(uid => s.cards[uid].cardId);
    const players = s.players.map((p): PositionSide => {
        const field: (PositionUnit | null)[] = Array.from({ length: FIELD_SIZE }, () => null);
        for (const uid of p.field) {
            const c = s.cards[uid], printed = scriptOf(c.cardId).keywords ?? [];
            const u: PositionUnit = { id: c.cardId };
            if (c.attackBonus) u.attack = c.attackBonus;
            if (c.hpBonus) u.hp = c.hpBonus;
            if (c.damage) u.damage = c.damage;
            if (!same(c.keywords, printed)) u.keywords = [...c.keywords];
            if (c.entered === s.turn) u.fresh = true;
            if (c.exhausted) u.acted = true;
            if (c.shield) u.shield = true;
            if (c.ateOn === s.turn - 1) u.ate = true;
            // A unit at 0 HP is about to be removed: keep the position playable.
            if (hpOf(c, catalog) <= 0) continue;
            field[c.slot ?? field.indexOf(null)] = u;
        }
        while (field.length && field.at(-1) === null) field.pop();
        const side: PositionSide = {
            playable: p.playable, points: p.points, maxPoints: p.maxPoints, turns: p.turns,
            maxPp: Math.max(0, Math.min(MAX_PP, p.turns + p.ppBonus)), pp: p.pp,
            field,
            hand: p.hand.map(uid => {
                const c = s.cards[uid];
                return c.costDelta || c.revealed ? { id: c.cardId, ...(c.costDelta && { cost: c.costDelta }), ...(c.revealed && { revealed: true }) } : c.cardId;
            }),
            nap: ids(p.nap), yojo: ids(p.yojo), sweet: ids(p.sweet),
        };
        if (p.exile.length) side.exile = ids(p.exile);
        if (p.skills.some((left, i) => left !== skillsFor(p.playable)[i]?.uses)) side.skills = [...p.skills];
        if (p.played.length) side.played = [...p.played];
        if (p.shield) side.shield = true;
        if (p.sweetBoost) side.sweetBoost = p.sweetBoost;
        return side;
    }) as [PositionSide, PositionSide];
    return { version: 1, active: s.active, first: s.rules.firstPlayer, players };
}

const PREFIX = 'PPL1.';

/** A share code: the position as base64url JSON, safe to paste into chat or a URL. */
export function encodePosition(position: Position): string {
    const bytes = new TextEncoder().encode(JSON.stringify(position));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The position in a share code (surrounding spaces or a pasted URL around it are ignored), or null. */
export function decodePosition(code: string): Position | null {
    const found = code.match(/PPL1\.([A-Za-z0-9_-]+)/);
    if (!found) return null;
    try {
        const binary = atob(found[1].replace(/-/g, '+').replace(/_/g, '/'));
        const json = new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)));
        return parsePosition(JSON.parse(json));
    } catch { return null; }
}
