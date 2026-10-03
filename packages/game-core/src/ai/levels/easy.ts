// よわい: picks a random legal move, but does not end the turn too eagerly.
import type { CpuStrategy } from '../types.ts';

export const easy: CpuStrategy = {
    level: 'easy',
    name: 'よわい',
    description: 'ルールの範囲で気まぐれに動きます',
    choose({ moves, random }) {
        const actions = moves.filter(m => m.command.type !== 'end');
        const end = moves.find(m => m.command.type === 'end');
        if (end && (!actions.length || random(4) === 0)) return end;
        return actions[random(actions.length)];
    },
};
