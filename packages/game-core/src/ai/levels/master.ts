import { cpuProfiles } from '../profiles.ts';
// さいきょう: always finds a winning line this turn when one exists (① findLethal); otherwise plays like つよい.
import { findLethal } from '../lethal.ts';
import type { CpuStrategy } from '../types.ts';
import { hard } from './hard.ts';

/** Positions examined per decision; about a second in the worst case. */
const SEARCH_NODES = 4000;

export const master: CpuStrategy = {
    level: 'master',
    ...cpuProfiles.master,
    choose(d) {
        if (d.state.phase === 'playing') {
            const lethal = findLethal(d.state, d.side, d.catalog, { maxNodes: SEARCH_NODES });
            const first = lethal.line[0] && d.moves.find(m => JSON.stringify(m.command) === JSON.stringify(lethal.line[0]));
            if (first) return first;
        }
        return hard.choose(d);
    },
};
