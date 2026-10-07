import { cpuProfiles } from '../profiles.ts';
// さいきょう: look for lethal, then compare complete own plans against sampled opponent replies.
import { findLethal } from '../lethal.ts';
import { drawValue } from '../planning.ts';
import { searchTurn } from '../turn-search.ts';
import type { TurnSearchOptions } from '../turn-search.ts';
import type { CpuStrategy } from '../types.ts';
import { createValueEvaluator } from '../value.ts';
import { valueModel } from '../value-model.ts';
import { plainHard as hard } from './hard.ts';

/** Lethal search is bounded separately from the turn/reply search. */
const SEARCH_NODES = 4000;

export const createMaster = (options: TurnSearchOptions = {}): CpuStrategy => ({
    level: 'master',
    ...cpuProfiles.master,
    choose(d) {
        // A draw decision uses deck composition, not the top of a guessed deck.
        if (d.state.phase !== 'playing' || d.state.active !== d.side) {
            const draws = d.moves.flatMap(move => {
                const c = move.command;
                const deck = c.type === 'openingDraw' ? c.deck
                    : c.type === 'choose' && d.state.pending?.task.op === 'draw' && (c.option === 'yojo' || c.option === 'sweet') ? c.option : undefined;
                return deck ? [{ move, value: drawValue(d.state, d.side, deck, d.catalog) }] : [];
            });
            if (draws.length) {
                return draws.reduce((best, move) => move.value > best.value ? move : best).move;
            }
        }
        if (d.state.phase === 'playing') {
            const lethal = findLethal(d.state, d.side, d.catalog, { maxNodes: SEARCH_NODES });
            const first = lethal.line[0] && d.moves.find(m => JSON.stringify(m.command) === JSON.stringify(lethal.line[0]));
            if (first) return first;
            if (d.state.active === d.side) return searchTurn(d, hard.choose(d), options).move;
        }
        return hard.choose(d);
    },
});
/** Finished turns are scored by the value learned from self-play (ai/value.ts), not `evaluatePlan`. */
export const master = createMaster({ evaluate: createValueEvaluator(valueModel) });
