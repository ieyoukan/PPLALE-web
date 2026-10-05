// A match record sent by the game: checked by replaying it with the engine, so only matches that
// can really be played are stored. Nothing in it identifies the player.
import { createHash } from 'node:crypto';
import { applyCommand, matchTurns, newGame, sandboxRules } from '@pplale/game-core';
import type { Catalog, Command, Deck, GameState, Side } from '@pplale/game-core';
import { valueFeatures } from '@pplale/game-core/ai';
import { turnStarts } from '@pplale/game-core/train';

/** What is stored. The human played side 0, the CPU side 1. */
export interface MatchRecord {
    id: string;
    /** Day received (UTC). Not the time: a record should not be traceable to a visit. */
    day: string;
    level: 'master';
    /** Version of the model the CPU played with. */
    model: string;
    winner: Side;
    /** Turns per side. */
    turns: number;
    seed: number;
    decks: [StoredDeck, StoredDeck];
    commands: Command[];
}
type StoredDeck = Pick<Deck, 'yojo' | 'sweet' | 'playable'>;

const MAX_COMMANDS = 3000;
const isSide = (value: unknown): value is Side => value === 0 || value === 1;
const isText = (value: unknown, max = 24): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

function deck(value: unknown): StoredDeck | null {
    const d = value as Partial<Deck> | null;
    if (!d || typeof d !== 'object' || !isText(d.playable)) return null;
    const ids = (list: unknown, max: number): list is string[] => Array.isArray(list) && list.length <= max && list.every(id => isText(id));
    return ids(d.yojo, 40) && ids(d.sweet, 40) ? { yojo: [...d.yojo], sweet: [...d.sweet], playable: d.playable } : null;
}

/** A copy with only the fields of a real (non-sandbox) command, or null. */
function command(value: unknown): Command | null {
    const c = value as Record<string, unknown> | null;
    if (!c || typeof c !== 'object' || !isSide(c.actor)) return null;
    const actor = c.actor;
    switch (c.type) {
        case 'roll': case 'keep': case 'end': return { type: c.type, actor };
        case 'initiative': return c.order === 'first' || c.order === 'second' ? { type: 'initiative', actor, order: c.order } : null;
        case 'openingDraw': return c.deck === 'yojo' || c.deck === 'sweet' ? { type: 'openingDraw', actor, deck: c.deck } : null;
        case 'mulligan': return Array.isArray(c.uids) && c.uids.length <= 10 && c.uids.every(uid => isText(uid)) ? { type: 'mulligan', actor, uids: [...c.uids] as string[] } : null;
        case 'play': {
            if (!isText(c.uid) || c.slot !== undefined && !(Number.isInteger(c.slot) && (c.slot as number) >= 0 && (c.slot as number) < 16)) return null;
            return c.slot === undefined ? { type: 'play', actor, uid: c.uid } : { type: 'play', actor, uid: c.uid, slot: c.slot as number };
        }
        case 'attack': return isText(c.uid) && isText(c.target) ? { type: 'attack', actor, uid: c.uid, target: c.target } : null;
        case 'choose': return isText(c.option, 64) ? { type: 'choose', actor, option: c.option } : null;
        case 'skill': return Number.isInteger(c.index) && (c.index as number) >= 0 && (c.index as number) < 8 ? { type: 'skill', actor, index: c.index as number } : null;
        case 'reveal': return isText(c.uid) ? { type: 'reveal', actor, uid: c.uid } : null;
        default: return null;
    }
}

/** The match from its first state, one state per command; null when it cannot be played like that. */
function* replay(record: Pick<MatchRecord, 'seed' | 'decks' | 'commands'>, catalog: Catalog): Generator<GameState, GameState | null> {
    let state: GameState;
    try {
        state = newGame([{ ...record.decks[0], name: 'プレイヤー' }, { ...record.decks[1], name: 'CPU' }], catalog, sandboxRules, record.seed);
    } catch { return null; }
    for (const next of record.commands) {
        yield state;
        const result = applyCommand(state, next, catalog);
        if (result.error) return null;
        state = result.state;
    }
    return state;
}

/** Checks and replays a received report. The winner comes from the replay, never from the sender. */
export function verifyReport(body: unknown, catalog: Catalog, day = new Date().toISOString().slice(0, 10)): MatchRecord | { error: string } {
    const b = body as Record<string, unknown> | null;
    if (!b || typeof b !== 'object') return { error: 'not a report' };
    if (b.level !== 'master') return { error: 'only さいきょう matches are collected' };
    if (!Number.isInteger(b.seed) || (b.seed as number) < 0 || (b.seed as number) > 0xffffffff) return { error: 'seed' };
    if (!Array.isArray(b.decks) || b.decks.length !== 2 || !Array.isArray(b.commands) || b.commands.length < 1 || b.commands.length > MAX_COMMANDS) return { error: 'decks or commands' };
    const decks = b.decks.map(deck), commands = b.commands.map(command);
    if (decks.includes(null) || commands.includes(null)) return { error: 'decks or commands' };
    const record = { seed: b.seed as number, decks: decks as [StoredDeck, StoredDeck], commands: commands as Command[] };
    const states = replay(record, catalog);
    let step = states.next();
    while (!step.done) step = states.next();
    const end = step.value;
    if (!end) return { error: 'the match cannot be replayed' };
    if (!isSide(end.winner)) return { error: 'the match is not finished' };
    const id = createHash('sha256').update(JSON.stringify([record.seed, record.decks, record.commands])).digest('hex').slice(0, 24);
    return { id, day, level: 'master', model: isText(b.model, 40) ? b.model : 'unknown', winner: end.winner, turns: matchTurns(end), ...record };
}

/** Training positions of a stored match: every turn start, and whether side 0 (the human) won. */
export function recordPositions(record: MatchRecord, catalog: Catalog): { rows: Float32Array[]; won: 0 | 1 } | null {
    const rows: Float32Array[] = [], begins = turnStarts(), states = replay(record, catalog);
    let step = states.next();
    for (; !step.done; step = states.next()) if (begins(step.value)) rows.push(valueFeatures(step.value, catalog));
    // The engine may have changed since the match was played: skip what no longer replays the same way.
    return step.value?.winner === record.winner ? { rows, won: record.winner === 0 ? 1 : 0 } : null;
}
