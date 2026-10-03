// ① 勝ち筋の完全探索: is there a sequence of own commands that wins this turn?
import { cloneState } from '../core/state.ts';
import { shuffled } from '../core/rng.ts';
import { applyCommand } from '../commands/index.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { legalMoves } from './moves.ts';
import type { Move } from './moves.ts';

export interface LethalResult {
    /**
     * win: `line` wins this turn whatever the hidden cards and dice are.
     * none: every line was tried and none is certain to win.
     * unknown: the node budget ran out first.
     */
    status: 'win' | 'none' | 'unknown';
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
 * Depth-first search over this side's own commands until the turn ends. Transpositions (the same
 * position reached in another order) are visited once. A line through luck is accepted only if it
 * wins in every re-rolled world. Call it with the CPU's view (see determinize), never the real state.
 */
export function findLethal(start: GameState, side: Side, catalog: Catalog, { maxNodes = 4000, checks = 8 }: LethalOptions = {}): LethalResult {
    if (start.phase !== 'playing' || start.winner !== null) return { status: 'none', line: [], nodes: 0 };
    const seen = new Set<number>();
    let exhausted = false;
    const search = (s: GameState, line: Command[], lucky: boolean): Command[] | null => {
        if (seen.size >= maxNodes) {
            exhausted = true;
            return null;
        }
        // A position reached through luck is searched again if reached without it.
        const key = positionKey(s) * 2 + (lucky ? 1 : 0);
        if (seen.has(key)) return null;
        seen.add(key);
        const moves = legalMoves(s, side, catalog).filter(m => m.command.type !== 'end').sort((a, b) => priority(a) - priority(b));
        for (const move of moves) {
            const next = [...line, move.command], luck = lucky || usesLuck(s, move.next);
            if (move.next.winner === side) {
                if (!luck || certain(start, side, next, catalog, checks)) return next;
                continue;
            }
            if (move.next.winner !== null) continue;
            // The opponent has to answer something mid-turn: the line cannot be planned further.
            if (move.next.pending && move.next.pending.task.actor !== side) continue;
            const found = search(move.next, next, luck);
            if (found) return found;
        }
        return null;
    };
    const line = search(start, [], false);
    return { status: line ? 'win' : exhausted ? 'unknown' : 'none', line: line ?? [], nodes: seen.size };
}
