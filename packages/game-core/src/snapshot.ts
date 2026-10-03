// Restoring a saved match: validate the shape, check card references, migrate older formats.
import { z } from 'zod';
import { deckLabel, keywords } from './model.ts';
import type { Catalog, GameState, TaskOp } from './model.ts';
import { selectable, unitsInScope } from './effects/targets.ts';
import { availablePpMaximum } from './core/cards.ts';
import { opDef, resolveQueue } from './effects/resolve.ts';

const integer = z.number().int();
const positive = integer.nonnegative();
const side = z.union([z.literal(0), z.literal(1)]);
const ids = z.array(z.string()).max(500);
const keyword = z.enum(keywords as [string, ...string[]]);
const task = z.object({ op: z.string(), actor: side, source: z.string().optional(), target: z.string().optional(), amount: integer.optional(), hp: integer.optional(), keyword: keyword.optional(), cardId: z.string().optional(), scope: z.enum(['friendly', 'enemy', 'any']).optional(), ids: ids.optional(), candidates: ids.optional(), count: positive.optional(), multiplier: positive.optional(), text: z.string().optional(), deck: z.enum(['yojo', 'sweet']).optional() });
const player = z.object({
    name: z.string(), yojo: ids, sweet: ids, hand: ids, field: ids.max(7), nap: ids, exile: ids, playable: z.string(),
    points: positive, maxPoints: positive, turns: positive, pp: positive, ppBonus: integer, turnPpBonus: positive.max(2).default(0), nextPpDebt: positive,
    milestones: z.array(z.union([z.literal(10), z.literal(5)])), played: ids, shield: z.boolean(),
    // v1 saves stored おいしくなる呪文 as a boolean.
    sweetBoost: positive.optional(), doubleSweet: z.boolean().optional(),
    skills: z.array(positive), lastBorrow: integer,
}).transform(({ doubleSweet, sweetBoost, ...rest }) => ({ ...rest, sweetBoost: sweetBoost ?? (doubleSweet ? 1 : 0) }));
const schema = z.object({
    version: z.literal(1), effectTauntRules: z.literal(true).optional(), turnRules: z.literal(true).optional(), phase: z.enum(['dice', 'initiative', 'opening', 'mulligan', 'playing']).default('playing'), dice: z.object({ rolls: z.tuple([integer.min(1).max(6).nullable(), integer.min(1).max(6).nullable()]), ties: positive }).nullable().default(null), rng: positive, serial: positive, revision: positive, active: side, turn: positive,
    rules: z.object({ initialPoints: integer.positive(), initialYojo: positive.max(20), initialSweet: positive.max(10), firstPlayer: side, turnDraw: z.enum(['yojo', 'sweet']) }),
    openingRemaining: z.tuple([positive, positive]).default([0, 0]),
    stall: z.object({ acted: z.boolean(), idleTurns: positive }).optional(),
    effectBlocks: z.object({ revision: positive, events: z.array(z.object({ uid: z.string(), kind: z.enum(['damage', 'destroy']) })).max(500) }).optional(),
    mulligan: z.object({ eligible: z.tuple([ids, ids]), confirmed: z.tuple([z.boolean(), z.boolean()]) }).default({ eligible: [[], []], confirmed: [false, false] }),
    players: z.tuple([player, player]),
    cards: z.record(z.string(), z.object({ uid: z.string(), cardId: z.string(), attackBonus: integer, hpBonus: integer, damage: positive, costDelta: integer, temporaryCost: integer, keywords: z.array(keyword), shield: z.boolean(), slot: integer.min(0).max(6).nullable().default(null), entered: integer, exhausted: z.boolean(), ateOn: integer, revealed: z.boolean(), links: ids })),
    queue: z.array(task).max(500), pending: z.object({ prompt: z.string(), options: z.array(z.object({ id: z.string(), label: z.string() })), task }).nullable(), winner: z.union([side, z.literal('draw')]).nullable(), log: z.array(z.string()).max(100),
});
type Saved = z.infer<typeof schema>;
type SavedTask = z.infer<typeof task>;

export function restoreGame(value: unknown, catalog: Catalog): GameState | null {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return null;
    const s = parsed.data;
    if (!validReferences(s, catalog)) return null;
    if (!migrateFieldSlots(s)) return null;
    migrateOpening(s);
    migrateTasks(s);
    migrateEffectTargets(s, catalog);
    if ([...s.queue, ...(s.pending ? [s.pending.task] : [])].some(t => !opDef(t.op as TaskOp))) return null;
    migrateTurnRules(s, catalog);
    return s as GameState;
}

function validReferences(s: Saved, catalog: Catalog) {
    const all: string[] = [];
    for (const p of s.players) {
        if (!catalog[p.playable]) return false;
        for (const zone of ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'] as const) all.push(...p[zone]);
    }
    if (new Set(all).size !== all.length || all.some(id => !s.cards[id])) return false;
    return !Object.entries(s.cards).some(([uid, c]) => uid !== c.uid || !catalog[c.cardId]);
}

// Snapshots from before explicit field positions get the first free slots. False on overlaps.
function migrateFieldSlots(s: Saved) {
    for (const p of s.players) {
        const occupied = p.field.map(uid => s.cards[uid].slot).filter(slot => slot !== null);
        for (const uid of p.field) {
            const card = s.cards[uid];
            if (card.slot !== null) continue;
            card.slot = Array.from({ length: 7 }, (_, i) => i).find(i => !occupied.includes(i))!;
            occupied.push(card.slot);
        }
    }
    return s.players.every(p => new Set(p.field.map(uid => s.cards[uid].slot)).size === p.field.length);
}

// The old sequential opening queue becomes independent draw obligations.
function migrateOpening(s: Saved) {
    if (s.phase !== 'opening') return;
    const isOpening = (t: SavedTask) => t.op === 'draw' && t.text === 'opening';
    for (const t of [...s.queue, ...(s.pending ? [s.pending.task] : [])].filter(isOpening)) s.openingRemaining[t.actor] += t.count ?? 1;
    s.queue = s.queue.filter(t => !isOpening(t));
    if (s.pending && isOpening(s.pending.task)) s.pending = null;
}

/** Steps from older engine versions expressed with the current ones. */
function migrateTasks(s: Saved) {
    const legacyDrawTags = ['attackIfYojo', 'hpIfSweet', 'parfait', 'oftini', 'mulligan', 'draw'];
    // The sequential mulligan draw no longer exists; the hand was untouched until it resolved.
    const isOldMulligan = (t: SavedTask) => t.op === 'draw' && t.text === 'mulligan';
    s.queue = s.queue.filter(t => !isOldMulligan(t));
    if (s.pending && isOldMulligan(s.pending.task)) s.pending = null;
    // 'discardThen' = discard, then the card's follow-up steps.
    const followUps = (t: SavedTask): SavedTask[] => t.text === 'oftini'
        ? [{ op: 'heal', actor: t.actor, source: t.source, amount: 2 }, { op: 'draw', actor: t.actor, source: t.source, count: 2 }]
        : [{ op: 'draw', actor: t.actor, source: t.source }];
    s.queue = s.queue.flatMap(t => t.op === 'discardThen' ? [{ ...t, op: 'discard', text: undefined }, ...followUps(t)] : [t]);
    if (s.pending?.task.op === 'discardThen') {
        s.queue.unshift(...followUps(s.pending.task));
        s.pending.task = { ...s.pending.task, op: 'discard', text: undefined };
    }
    for (const t of [...s.queue, ...(s.pending ? [s.pending.task] : [])]) {
        // Effect hooks now come from the source card's script.
        if (t.op === 'draw' && legacyDrawTags.includes(t.text ?? '')) delete t.text;
        // Opening and turn draws are a free choice of deck.
        if (t.op === 'draw' && (t.text === 'opening' || t.text === 'turn')) delete t.deck;
    }
    if (s.pending?.task.op === 'draw' && !s.pending.task.deck) {
        const p = s.players[s.pending.task.actor];
        s.pending.options = (['yojo', 'sweet'] as const).map(kind => ({ id: kind, label: `${deckLabel(kind)}デッキ（${p[kind].length}枚）` }));
    }
}

// Saved choices from the attack-only taunt rule must adopt the current effect targeting.
function migrateEffectTargets(s: Saved, catalog: Catalog) {
    if (s.effectTauntRules) return;
    s.effectTauntRules = true;
    const state = s as GameState;
    const candidatesFor = (t: SavedTask) => {
        const scope = unitsInScope(state, t);
        return selectable(state, t.actor, (t.candidates ?? scope).filter(uid => scope.includes(uid)));
    };
    for (const t of s.queue) {
        if (opDef(t.op as TaskOp)?.target === 'unit' && t.candidates) t.candidates = candidatesFor(t);
    }
    if (!s.pending) return;
    const t = s.pending.task;
    if (opDef(t.op as TaskOp)?.target === 'unit') {
        t.candidates = candidatesFor(t);
        s.pending.options = t.candidates.filter(uid => !(t.ids ?? []).includes(uid))
            .map(uid => ({ id: uid, label: catalog[s.cards[uid].cardId].name }));
    } else if (t.op === 'punish') {
        const units = s.pending.options.map(o => o.id).filter(uid => s.players[t.actor === 0 ? 1 : 0].field.includes(uid));
        const allowed = selectable(state, t.actor, units);
        s.pending.options = s.pending.options.filter(o => o.id === 'all' || allowed.includes(o.id));
    }
}

/** Upgrade old saved choices and the one-time second-player fifth-turn PP grant. */
function migrateTurnRules(s: Saved, catalog: Catalog) {
    const state = s as GameState;
    if (!s.turnRules) {
        s.turnRules = true;
        const p = s.players[s.active];
        if (s.phase === 'playing' && s.active !== s.rules.firstPlayer && p.turns === 5) {
            p.turnPpBonus = 2;
            p.pp = Math.min(availablePpMaximum(state, s.active), p.pp + 2);
        }
    }
    if (s.pending?.task.op !== 'draw') return;
    const t = s.pending.task, p = s.players[t.actor];
    const kinds = (t.deck ? [t.deck] : ['yojo', 'sweet'] as const).filter(kind => p[kind].length > 0);
    if (kinds.length) {
        s.pending.options = [...kinds.map(kind => ({ id: kind, label: `${deckLabel(kind)}デッキ（${p[kind].length}枚）` })),
            ...(t.text === 'threshold' ? [{ id: 'skip', label: '引かない' }] : [])];
    } else {
        s.pending = null;
        s.queue.unshift({ ...t, target: undefined });
        resolveQueue(state, catalog);
    }
}
