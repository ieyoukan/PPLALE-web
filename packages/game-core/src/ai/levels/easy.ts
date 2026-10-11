import { cpuProfiles } from '../profiles.ts';
import { scriptOf } from '../../cards/registry.ts';
import { cardContext, effects } from '../../effects/context.ts';
import { other } from '../../model.ts';
import { skillsFor } from '../../playables/skills.ts';
// よわい: notices immediate wins and obvious waste, then chooses randomly.
import type { CpuStrategy } from '../types.ts';

export const easy: CpuStrategy = {
    level: 'easy',
    ...cpuProfiles.easy,
    choose({ state, side, catalog, moves, random }) {
        const win = moves.find(m => m.next.winner === side);
        if (win) return win;
        const actions = moves.filter(m => {
            if (m.command.type === 'end' || m.next.winner === other(side)) return false;
            if (state.phase !== 'playing' || state.pending) return true;
            if (m.command.type === 'play') {
                const uid = m.command.uid;
                return scriptOf(state.cards[uid].cardId).cpu?.worthPlaying?.(cardContext(state, catalog, side, uid)) ?? true;
            }
            if (m.command.type === 'skill') {
                return skillsFor(state.players[side].playable)[m.command.index].cpu?.(effects(state, catalog, side)) ?? true;
            }
            return true;
        });
        const end = moves.find(m => m.command.type === 'end');
        if (end && (!actions.length || random(8) === 0)) return end;
        return actions.length ? actions[random(actions.length)] : moves[0];
    },
};
