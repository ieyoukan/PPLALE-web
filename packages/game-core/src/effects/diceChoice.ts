import type { Choice, GameState } from '../model.ts';

/** クマはサイコロを振らない is automatic: choose a face, never whether to activate. */
export function diceChoice(uses: number): Pick<Choice, 'prompt' | 'options'> {
    return {
        prompt: 'クマはサイコロを振らない：出目を指定してください',
        options: Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), label: `出目を${i + 1}にする（残り${uses}回）` })),
    };
}

/** Older saves and live rooms can still contain the removed "roll" option. */
export function refreshDiceChoice(state: GameState) {
    const pending = state.pending;
    if (pending?.task.op !== 'die') return;
    const uses = state.players[pending.task.actor].exSkills?.dice?.uses ?? 0;
    if (uses > 0) Object.assign(pending, diceChoice(uses));
}
