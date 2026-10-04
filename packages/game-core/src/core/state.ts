import type { Choice, GameState, Instance, Player, Task } from '../model.ts';

const cloneTask = (t: Task): Task => ({ ...t, ids: t.ids && [...t.ids], candidates: t.candidates && [...t.candidates] });
const clonePlayer = (p: Player): Player => ({
    ...p, yojo: [...p.yojo], sweet: [...p.sweet], hand: [...p.hand], field: [...p.field], nap: [...p.nap], exile: [...p.exile],
    milestones: [...p.milestones], played: [...p.played], skills: [...p.skills],
});
const cloneChoice = (c: Choice): Choice => ({ prompt: c.prompt, options: c.options.map(o => ({ ...o })), task: cloneTask(c.task) });

/**
 * Deep copy of a match, written out by hand because it runs for every simulated move (~10× faster
 * than structuredClone). tests/state.test.mjs checks that no nested object is shared, so a new
 * field in model.ts that is not copied here fails the tests.
 */
export function cloneState(s: GameState): GameState {
    const cards: Record<string, Instance> = {};
    for (const uid in s.cards) {
        const c = s.cards[uid];
        cards[uid] = { ...c, keywords: [...c.keywords], links: [...c.links] };
    }
    return {
        ...s,
        openingRemaining: [s.openingRemaining[0], s.openingRemaining[1]],
        mulligan: { eligible: [[...s.mulligan.eligible[0]], [...s.mulligan.eligible[1]]], confirmed: [s.mulligan.confirmed[0], s.mulligan.confirmed[1]] },
        dice: s.dice && { rolls: [s.dice.rolls[0], s.dice.rolls[1]], ties: s.dice.ties },
        rules: { ...s.rules },
        players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
        cards,
        queue: s.queue.map(cloneTask),
        pending: s.pending && cloneChoice(s.pending),
        log: [...s.log],
        ...(s.stall ? { stall: { ...s.stall } } : {}),
        ...(s.effectBlocks ? { effectBlocks: { revision: s.effectBlocks.revision, events: s.effectBlocks.events.map(event => ({ ...event })) } } : {}),
    };
}
