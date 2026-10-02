import { z } from 'zod';
import type { Catalog, GameState } from './model.ts';
const integer = z.number().int();
const positive = integer.nonnegative();
const side = z.union([z.literal(0), z.literal(1)]);
const ids = z.array(z.string()).max(500);
const keyword = z.enum(['charge', 'fast', 'taunt', 'guard', 'pierce', 'immobile', 'noEat', 'effectImmune']);
const task = z.object({ op: z.string(), actor: side, source: z.string().optional(), target: z.string().optional(), amount: integer.optional(), hp: integer.optional(), keyword: keyword.optional(), cardId: z.string().optional(), scope: z.enum(['friendly', 'enemy', 'any']).optional(), ids: ids.optional(), count: positive.optional(), multiplier: positive.optional(), text: z.string().optional(), deck: z.enum(['yojo', 'sweet']).optional() });
const player = z.object({ name: z.string(), yojo: ids, sweet: ids, hand: ids, field: ids.max(7), nap: ids, exile: ids, playable: z.string(), points: positive, maxPoints: positive, turns: positive, pp: positive, ppBonus: integer, nextPpDebt: positive, milestones: z.array(z.union([z.literal(10), z.literal(5)])), played: ids, shield: z.boolean(), doubleSweet: z.boolean(), skills: z.array(positive), lastBorrow: integer });
const schema = z.object({
    version: z.literal(1), phase: z.enum(['dice', 'opening', 'playing']).default('playing'), dice: z.object({rolls: z.tuple([integer.min(1).max(6), integer.min(1).max(6)]), ties: positive}).nullable().default(null), rng: positive, serial: positive, revision: positive, active: side, turn: positive,
    rules: z.object({ initialPoints: integer.positive(), initialYojo: positive.max(20), initialSweet: positive.max(10), firstPlayer: side, turnDraw: z.enum(['yojo', 'sweet']), firstTurnDraw: z.boolean(), maxPP: integer.positive(), stealHeals: z.boolean(), emptyDeckLoses: z.boolean(), guardBlocksUnits: z.boolean(), pierceIgnoresTaunt: z.boolean() }),
    players: z.tuple([player, player]),
    cards: z.record(z.string(), z.object({ uid: z.string(), cardId: z.string(), attackBonus: integer, hpBonus: integer, damage: positive, costDelta: integer, temporaryCost: integer, keywords: z.array(keyword), shield: z.boolean(), slot: integer.min(0).max(6).nullable().default(null), entered: integer, exhausted: z.boolean(), ateOn: integer, revealed: z.boolean(), links: ids })),
    queue: z.array(task).max(500), pending: z.object({ prompt: z.string(), options: z.array(z.object({ id: z.string(), label: z.string() })), task }).nullable(), winner: z.union([side, z.literal('draw')]).nullable(), log: z.array(z.string()).max(100),
});
export function restoreGame(value: unknown, catalog: Catalog): GameState | null {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        return null;
    const s = parsed.data;
    const allIds: string[] = [];
    for (const p of s.players) {
        if (!catalog[p.playable])
            return null;
        for (const zone of ['yojo', 'sweet', 'hand', 'field', 'nap', 'exile'] as const)
            allIds.push(...p[zone]);
    }
    if (new Set(allIds).size !== allIds.length || allIds.some(id => !s.cards[id]))
        return null;
    if (Object.entries(s.cards).some(([uid, c]) => uid !== c.uid || !catalog[c.cardId]))
        return null;
    for (const p of s.players) {
        const occupied: number[] = [];
        for (const uid of p.field) {
            const card = s.cards[uid];
            // Migrate snapshots from before explicit field positions were introduced.
            if (card.slot === null) card.slot = Array.from({length: 7}, (_, i) => i).find(i => !occupied.includes(i))!;
            if (occupied.includes(card.slot)) return null;
            occupied.push(card.slot);
        }
    }
    return s as GameState;
}
