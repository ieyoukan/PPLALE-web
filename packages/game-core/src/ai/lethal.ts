// 勝ち筋の探索: is there a sequence of own commands that wins this turn?
import { cloneState } from '../core/state.ts';
import { shuffled } from '../core/rng.ts';
import { attackOf, hpOf } from '../core/cards.ts';
import { applyCommand } from '../commands/index.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { other } from '../model.ts';
import { legalMoves } from './moves.ts';
import type { Move } from './moves.ts';

export interface LethalResult {
    /**
     * win: `line` wins this turn, including every sampled re-roll if it uses luck.
     * none: every line was tried and none passed those checks.
     * unknown: the node budget ran out first.
     */
    status: 'win' | 'none' | 'unknown';
    /** Includes mandatory opponent threshold draws; execute only the first own command, then replan. */
    line: Command[];
    /** Distinct positions examined. */
    nodes: number;
}
export interface LethalOptions {
    /** Distinct positions to examine at most. */
    maxNodes?: number;
    /** Re-rolled worlds a line that touches luck (draws, dice, random targets) must win in. */
    checks?: number;
}

/** 52-bit string hash (cyrb53), so `key * 2 + 1` stays exact. A few thousand positions collide with ~1e-9 chance. */
function hash(text: string): number {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (1048575 & h2) + (h1 >>> 0);
}

/**
 * Positions that differ only in history (log, revision) are the same for the search. Cards inside
 * a deck never change while there (only their order, kept in the player), so they are left out.
 */
function positionKey(s: GameState): number {
    const inPlay = s.players.flatMap(p => [...p.hand, ...p.field, ...p.nap, ...p.exile]).map(uid => s.cards[uid]);
    return hash(JSON.stringify([s.players, inPlay, s.pending, s.queue, s.winner, s.rng, s.active, s.turn, s.serial]));
}

/** The move drew cards or used the random generator, so its result depends on luck. */
function usesLuck(before: GameState, after: GameState): boolean {
    return before.rng !== after.rng || before.players.some((p, i) => p.yojo.length !== after.players[i].yojo.length || p.sweet.length !== after.players[i].sweet.length);
}

/** Moves most likely to finish the opponent first, so wins are found early. */
const priority = (m: Move) => {
    const c = m.command;
    if (m.next.winner !== null) return 0;
    if (c.type === 'attack') return c.target === 'leader' ? 1 : 3;
    if (c.type === 'play' || c.type === 'choose') return 2;
    if (c.type === 'skill') return 4;
    return 5;
};

/** Order the search by damage, guard removal and attackers still available this turn. */
function distance(s: GameState, side: Side, catalog: Catalog): number {
    if (s.winner === side) return -1e9;
    if (s.winner !== null) return 1e9;
    const me = s.players[side], enemy = s.players[other(side)];
    const guards = enemy.field.filter(uid => s.cards[uid].keywords.includes('guard'));
    const guardValue = (uid: string) => 30 + Math.max(0, hpOf(s.cards[uid], catalog)) * 3 + (s.cards[uid].shield ? 5 : 0);
    let obstruction = guards.reduce((total, uid) => total + guardValue(uid), 0);
    // Target selection is still searched. Estimate its best guard removal for ordering only.
    const task = s.pending?.task;
    if (task?.actor === side && task.op === 'damage') {
        const damage = (task.amount ?? 0) * (task.multiplier ?? 1);
        const selectable = new Set(s.pending!.options.map(option => option.id));
        obstruction -= Math.max(0, ...guards.filter(uid => selectable.has(uid)).map(uid => {
            const c = s.cards[uid];
            if (c.keywords.includes('effectImmune') || damage <= 0) return 0;
            if (c.shield) return 5;
            return damage >= hpOf(c, catalog) ? guardValue(uid) : damage * 3;
        }));
    }
    let pressure = 0;
    for (const uid of me.field) {
        const c = s.cards[uid], attack = attackOf(c, catalog);
        if (c.exhausted || attack <= 0 || c.keywords.includes('immobile')) continue;
        const ready = c.entered !== s.turn || c.keywords.includes('fast');
        const canTrade = ready || c.keywords.includes('charge');
        if (ready && !c.keywords.includes('noEat')) pressure += attack * 6;
        if (canTrade && obstruction > 0) pressure += attack * 2;
        if (c.cardId === 'y_20' && (ready || canTrade && enemy.field.length)) pressure += 12;
    }
    return enemy.points * 12 + obstruction + (enemy.shield ? 10 : 0) - pressure - me.pp * 0.1;
}

/** Replays `line` in worlds with other dice and deck orders; it must win in all of them. */
function certain(start: GameState, side: Side, line: Command[], catalog: Catalog, checks: number): boolean {
    for (let i = 1; i <= checks; i++) {
        let s = cloneState(start);
        s.rng = (s.rng ^ Math.imul(i, 0x9e3779b9)) >>> 0;
        for (const kind of ['yojo', 'sweet'] as const) s.players[side][kind] = shuffled(s, s.players[side][kind]);
        for (const command of line) {
            const result = applyCommand(s, command, catalog);
            if (result.error) return false;
            s = result.state;
        }
        if (s.winner !== side) return false;
    }
    return true;
}

/**
 * Depth-first search over this side's commands and forced threshold draws until the turn ends.
 * Transpositions (the same position reached in another order) are visited once. A line through luck
 * must win in every sampled re-roll. Call it with the CPU's view (see determinize), never the real state.
 */
export function findLethal(start: GameState, side: Side, catalog: Catalog, { maxNodes = 4000, checks = 8 }: LethalOptions = {}): LethalResult {
    if (start.phase !== 'playing' || start.winner !== null) return { status: 'none', line: [], nodes: 0 };
    const seen = new Set<number>();
    let exhausted = false;
    const search = (s: GameState, line: Command[], lucky: boolean): Command[] | null => {
        if (s.winner !== null) return s.winner === side && (!lucky || certain(start, side, line, catalog, checks)) ? line : null;
        if (seen.size >= maxNodes) {
            exhausted = true;
            return null;
        }
        // A position reached through luck is searched again if reached without it.
        const key = positionKey(s) * 2 + (lucky ? 1 : 0);
        if (seen.has(key)) return null;
        seen.add(key);
        if (s.pending && s.pending.task.actor !== side) {
            const { task, options } = s.pending;
            // No opponent choice or newly drawn hidden card is used by our subsequent commands.
            // Resolving the draw may also resume queued random effects, so keep the luck checks.
            if (task.op !== 'draw' || task.text !== 'threshold' || task.source || task.deck !== 'sweet'
                || options.length !== 1 || options[0].id !== 'sweet') return null;
            const [forced] = legalMoves(s, task.actor, catalog);
            return forced ? search(forced.next, [...line, forced.command], lucky || usesLuck(s, forced.next)) : null;
        }
        const moves = legalMoves(s, side, catalog).filter(m => m.command.type !== 'end')
            .map(move => ({ move, distance: distance(move.next, side, catalog) }))
            .sort((a, b) => a.distance - b.distance || priority(a.move) - priority(b.move))
            .map(({ move }) => move);
        for (const move of moves) {
            const next = [...line, move.command], luck = lucky || usesLuck(s, move.next);
            const found = search(move.next, next, luck);
            if (found) return found;
        }
        return null;
    };
    const line = search(start, [], false);
    return { status: line ? 'win' : exhausted ? 'unknown' : 'none', line: line ?? [], nodes: seen.size };
}
