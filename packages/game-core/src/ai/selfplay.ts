// CPU-vs-CPU matches: level comparisons now, training data for a learned CPU (③) later.
import { applyCommand } from '../commands/index.ts';
import { cpuCommand } from './index.ts';
import { actingSides } from './moves.ts';
import type { CpuLevel, CpuStrategy } from './types.ts';
import { newGame } from '../setup.ts';
import { matchTurns, sandboxRules } from '../model.ts';
import type { Catalog, Command, Deck, GameState, Rules, Side } from '../model.ts';

const yojoIds = Array.from({ length: 31 }, (_, i) => `y_${i}`);
const sodaIds = Array.from({ length: 6 }, (_, i) => `s_${i}`);
const sweetIds = Array.from({ length: 22 }, (_, i) => `s_${i + 6}`);

/** A random legal strawberry deck (at most one of each animal soda). */
export function randomStrawberryDeck(seed: number): Deck {
    let r = seed >>> 0;
    const next = (n: number) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % n; };
    const sodas = sodaIds.filter(() => next(3) === 0).slice(0, 3);
    return {
        name: `ランダム${seed}`,
        playable: `p_${next(6)}`,
        yojo: Array.from({ length: 20 }, () => yojoIds[next(yojoIds.length)]),
        sweet: [...sodas, ...Array.from({ length: 10 - sodas.length }, () => sweetIds[next(sweetIds.length)])],
    };
}

export interface MatchOptions {
    /** A registered level or any strategy (e.g. a variant being trained) per side. */
    levels: [CpuLevel | CpuStrategy, CpuLevel | CpuStrategy];
    seed: number;
    decks?: [Deck, Deck];
    /** Defaults to the rulebook setup; exhausted decks do not cause a loss. */
    rules?: Rules;
    maxCommands?: number;
    /** Called before each command: the hook for recording training data. */
    onStep?: (state: GameState, command: Command, side: Side) => void;
}
export interface MatchResult {
    winner: Side | 'draw' | null;
    /** Turns per side (see matchTurns), not both sides added up. */
    turns: number;
    commands: number;
    /** Milliseconds each side spent deciding. */
    thinking: [number, number];
}

/** Plays one match to the end. Throws if a CPU sends a command the engine rejects. */
export function playMatch(catalog: Catalog, { levels, seed, decks, rules, maxCommands = 4000, onStep }: MatchOptions): MatchResult {
    const pair = decks ?? [randomStrawberryDeck(seed), randomStrawberryDeck(Math.imul(seed, 31) + 7)];
    let s = newGame(pair, catalog, rules ?? sandboxRules, seed);
    const thinking: [number, number] = [0, 0];
    const player = (side: Side) => typeof levels[side] === 'string' ? { level: levels[side] as CpuLevel } : { strategy: levels[side] as CpuStrategy };
    const nameOf = (side: Side) => typeof levels[side] === 'string' ? levels[side] as string : (levels[side] as CpuStrategy).name;
    let commands = 0;
    for (; commands < maxCommands && s.winner === null; commands++) {
        const [side] = actingSides(s);
        const started = Date.now();
        const command = s.phase === 'dice' ? { type: 'roll' as const, actor: side } : cpuCommand(s, catalog, { ...player(side), side });
        thinking[side] += Date.now() - started;
        if (!command) throw new Error(`${nameOf(side)} has no move in ${s.phase}`);
        onStep?.(s, command, side);
        const result = applyCommand(s, command, catalog);
        if (result.error) throw new Error(`${nameOf(side)} sent ${JSON.stringify(command)}: ${result.error}`);
        s = result.state;
    }
    return { winner: s.winner, turns: matchTurns(s), commands, thinking };
}
