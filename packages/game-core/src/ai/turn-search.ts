// Bounded beam search over a whole own turn, followed by the opponent's whole reply.
import { applyCommand } from '../commands/index.ts';
import { canAttack } from '../core/combat.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import { other } from '../model.ts';
import { WIN } from './evaluate.ts';
import { determinize } from './hidden.ts';
import { legalMoves } from './moves.ts';
import type { Move } from './moves.ts';
import { drawValue, evaluatePlan, orderPlan } from './planning.ts';
import type { CpuDecision } from './types.ts';

export interface TurnSearchOptions {
    /** Beam expansions, split fairly between actions/worlds; finishing rollouts have separate caps. */
    maxNodes?: number;
    /** Positions retained at each depth. */
    beamWidth?: number;
    /** Search depth in commands, including target choices; a bounded rollout completes the turn. */
    maxDepth?: number;
    /** Guessed opponent hands, deck orders and random seeds. */
    worlds?: number;
    /** Promising first actions; end and the one-step fallback are also considered. */
    candidates?: number;
}

interface Line {
    state: GameState;
    commands: Command[];
    score: number;
}
interface Limits {
    nodes: number;
    width: number;
    depth: number;
}
interface Planner {
    catalog: Catalog;
    key(state: GameState): string;
    value(state: GameState, side: Side): number;
    order(state: GameState, side: Side): number;
}
export interface TurnSearchResult {
    move: Move;
    /** Best own line in the first sampled world. Only the first command is committed. */
    line: Command[];
    score: number;
    /** Beam expansions; excludes the bounded finishing rollouts. */
    nodes: number;
    worlds: number;
}

const commandKey = (command: Command) => JSON.stringify(command);
const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    value !== undefined && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;

/** Ignore presentation/history, retaining all rule-relevant in-play state and randomness. */
function positionKey(s: GameState): string {
    const cards = s.players.flatMap(p => [...p.hand, ...p.field, ...p.nap, ...p.exile]).map(uid => s.cards[uid]);
    return JSON.stringify([s.players, cards, s.pending, s.queue, s.winner, s.rng, s.active, s.turn, s.serial, s.stall]);
}

/** Simulated states are immutable. These caches live for one decision, never across real turns. */
function planner(catalog: Catalog): Planner {
    const keys = new WeakMap<GameState, string>(), values = new WeakMap<GameState, number>();
    const value = (state: GameState, side: Side) => {
        let score = values.get(state);
        if (score === undefined) {
            score = evaluatePlan(state, 0, catalog);
            values.set(state, score);
        }
        return side === 0 ? score : -score;
    };
    return {
        catalog, value,
        key(state) {
            let key = keys.get(state);
            if (key === undefined) { key = positionKey(state); keys.set(state, key); }
            return key;
        },
        order: (state, side) => orderPlan(state, side, catalog, value(state, side)),
    };
}

/** Effects chosen by the other player are never treated as our own optional branches. */
function preferredChoice(s: GameState, p: Planner, moves: Move[]): Move {
    const actor = s.pending!.task.actor;
    const value = (m: Move) => s.pending!.task.op === 'draw'
        && m.command.type === 'choose' && (m.command.option === 'yojo' || m.command.option === 'sweet')
        ? drawValue(s, actor, m.command.option, p.catalog) : p.order(m.next, actor);
    return moves.reduce((best, move) => value(move) > value(best) ? move : best);
}

/** Finish a truncated line with useful attacks and mandatory choices before ending it. */
function finishLine(line: Line, actor: Side, turn: number, p: Planner): Line {
    const { catalog } = p;
    let state = line.state;
    const commands = [...line.commands];
    for (let step = 0; step < 64 && state.winner === null && state.active === actor && state.turn === turn; step++) {
        let command: Command;
        if (state.pending) {
            const moves = state.pending.options.flatMap(option => {
                const command: Command = { type: 'choose', actor: state.pending!.task.actor, option: option.id };
                const result = applyCommand(state, command, catalog);
                return result.error ? [] : [{ command, next: result.state }];
            });
            if (!moves.length) break;
            const move = preferredChoice(state, p, moves);
            command = move.command;
            state = move.next;
        } else {
            const targets = ['leader', ...state.players[other(actor)].field];
            const attacks = state.players[actor].field.flatMap(uid => targets.flatMap(target => {
                if (!canAttack(state, actor, uid, target, catalog)) return [];
                const command: Command = { type: 'attack', actor, uid, target };
                const result = applyCommand(state, command, catalog);
                return result.error ? [] : [{ command, next: result.state, score: p.order(result.state, actor) }];
            })).sort((a, b) => b.score - a.score);
            if (attacks[0] && attacks[0].score > p.value(state, actor) + 0.5) {
                command = attacks[0].command;
                state = attacks[0].next;
            } else {
                command = { type: 'end', actor };
                const result = applyCommand(state, command, catalog);
                if (result.error) break;
                state = result.state;
            }
        }
        commands.push(command);
    }
    return { state, commands, score: p.value(state, actor) };
}

/** Keep several completed plans per first action, so a safe alternative survives reply search. */
function turnLines(start: GameState, actor: Side, p: Planner, limits: Limits, initial?: Move[]) {
    const { catalog } = p;
    const completed = new Map<string, Line[]>(), seen = new Set<string>();
    let beam: Line[] = [{ state: start, commands: [], score: p.order(start, actor) }];
    let nodes = 0;
    const save = (line: Line) => {
        if (!line.commands.length) return;
        const first = commandKey(line.commands[0]), plans = completed.get(first) ?? [];
        const key = p.key(line.state);
        if (plans.some(plan => p.key(plan.state) === key)) return;
        plans.push(line);
        plans.sort((a, b) => b.score - a.score || a.commands.length - b.commands.length);
        completed.set(first, plans.slice(0, 3));
    };
    for (let depth = 0; depth < limits.depth && beam.length && nodes < limits.nodes; depth++) {
        const next: Line[] = [];
        for (const line of beam) {
            if (nodes >= limits.nodes) {
                save(finishLine(line, actor, start.turn, p));
                continue;
            }
            const s = line.state;
            if (s.winner !== null || s.active !== actor || s.turn !== start.turn) {
                save({ ...line, score: p.value(s, actor) });
                continue;
            }
            const first = line.commands[0] && commandKey(line.commands[0]);
            const key = `${first ?? ''}:${p.key(s)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            nodes++;
            const chooser = s.pending?.task.actor ?? actor;
            let moves = depth === 0 && initial ? initial : legalMoves(s, chooser, catalog);
            if (chooser !== actor && moves.length) moves = [preferredChoice(s, p, moves)];
            for (const move of moves) {
                const child: Line = {
                    state: move.next, commands: [...line.commands, move.command],
                    score: p.order(move.next, actor),
                };
                if (move.next.winner !== null || move.next.active !== actor || move.next.turn !== start.turn)
                    save({ ...child, score: p.value(move.next, actor) });
                else next.push(child);
            }
        }
        next.sort((a, b) => b.score - a.score || a.commands.length - b.commands.length);
        // Let first actions take a second step before narrowing, while the budget permits.
        beam = depth === 0 && initial && initial.length > 1 ? next : next.slice(0, limits.width);
    }
    for (const line of beam) save(finishLine(line, actor, start.turn, p));
    return { lines: [...completed.values()].flat().sort((a, b) => b.score - a.score), nodes };
}

/** Search each reply from the opponent's perspective and score its best resulting position. */
function replyScore(line: Line, side: Side, p: Planner, limits: Limits) {
    if (line.state.winner !== null) return { score: p.value(line.state, side), nodes: 0 };
    const actor = other(side);
    // A pathological effect chain can outlive the mandatory-choice cap; do not call it a finished turn.
    if (line.state.active !== actor) return { score: p.value(line.state, side) - 30, nodes: 0 };
    const reply = turnLines(line.state, actor, p, limits);
    return {
        score: reply.lines.length ? Math.min(...reply.lines.map(plan => p.value(plan.state, side)))
            : p.value(line.state, side),
        nodes: reply.nodes,
    };
}

/**
 * Root actions are shared across guessed worlds. Future commands may adapt to draws; only the
 * first action is returned, and the real CPU replans after every command. This is a bounded,
 * sampled approximation, not exhaustive minimax or a guarantee about hidden cards.
 */
export function searchTurn(d: CpuDecision, fallback: Move, options: TurnSearchOptions = {}): TurnSearchResult {
    const { state, side, catalog, moves } = d;
    if (state.phase !== 'playing' || state.active !== side || state.winner !== null)
        return { move: fallback, line: [fallback.command], score: evaluatePlan(state, side, catalog), nodes: 0, worlds: 0 };
    const p = planner(catalog);
    const maxNodes = bounded(options.maxNodes, 2400, 100, 20000);
    const width = bounded(options.beamWidth, 4, 1, 32), depth = bounded(options.maxDepth, 14, 2, 32);
    const worldCount = bounded(options.worlds, 3, 1, 8), candidateCount = bounded(options.candidates, 4, 1, 12);
    const preparationBudget = Math.min(Math.floor(maxNodes / 4), 180);
    const preparation = turnLines(state, side, p, { nodes: preparationBudget, width, depth }, moves);
    let nodes = preparation.nodes;
    const candidates = new Map<string, Move>();
    for (const line of preparation.lines) {
        const key = commandKey(line.commands[0]);
        const move = moves.find(m => commandKey(m.command) === key);
        if (move) candidates.set(key, move);
        if (candidates.size >= candidateCount) break;
    }
    candidates.set(commandKey(fallback.command), fallback);
    const end = moves.find(move => move.command.type === 'end');
    if (end) candidates.set(commandKey(end.command), end);
    const sampledWorlds = Math.min(worldCount, Math.max(1, Math.floor((maxNodes - nodes) / (candidates.size * 4))));
    const worlds = [state, ...Array.from({ length: sampledWorlds - 1 }, (_, i) =>
        determinize(state, side, catalog, (state.rng ^ Math.imul(i + 1, 0x9e3779b9) ^ state.revision) >>> 0))];
    const scenarioBudget = Math.max(1, Math.floor((maxNodes - nodes) / (candidates.size * worlds.length)));
    const ownBudget = Math.max(1, Math.floor(scenarioBudget * 0.4));
    const replyBudget = Math.max(1, Math.floor((scenarioBudget - ownBudget) / 3));
    let best: TurnSearchResult = { move: fallback, line: [fallback.command], score: -Infinity, nodes: 0, worlds: worlds.length };
    for (const move of candidates.values()) {
        const scores: number[] = [];
        let firstLine = [move.command];
        for (const [index, world] of worlds.entries()) {
            const result = applyCommand(world, move.command, catalog);
            if (result.error) {
                scores.push(-WIN);
                continue;
            }
            const own = turnLines(world, side, p, { nodes: ownBudget, width, depth }, [{ command: move.command, next: result.state }]);
            nodes += own.nodes;
            const lines = own.lines.slice(0, 3);
            if (!lines.length) lines.push(finishLine({ state: result.state, commands: [move.command], score: 0 }, side, world.turn, p));
            let score = -Infinity;
            for (const line of lines) {
                const reply = replyScore(line, side, p, { nodes: replyBudget, width: Math.max(1, Math.floor(width / 2)), depth });
                nodes += reply.nodes;
                if (reply.score > score) {
                    score = reply.score;
                    if (index === 0) firstLine = line.commands;
                }
            }
            scores.push(score);
        }
        const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
        // Prefer a plan that survives several replies over one that only works with a lucky deal.
        const score = mean - (mean - Math.min(...scores)) * 0.25;
        if (score > best.score) best = { move, line: firstLine, score, nodes: 0, worlds: worlds.length };
    }
    return { ...best, nodes };
}
