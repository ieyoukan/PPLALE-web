import { applyCommand } from '../commands/index.ts';
import { observeDecision } from './observation.ts';
import type { Catalog, Command, GameState, Side } from '../model.ts';
import type { GameObservation } from './types.ts';
import { legalActions } from './actions.ts';

export interface DecisionInput {
    version: 'pplale-decision-v1';
    decisionId: string;
    revision: number;
    viewer: Side;
    observation: GameObservation;
}
export interface ActionSelection { decisionId: string; actionId: string }
let serial = 0;

/** Engine-side binding. Only `input` is sent to models; commands/next states stay in closures. */
export function bindDecision(state: GameState, side: Side, catalog: Catalog) {
    const revision = state.revision, actions = legalActions(state, side, catalog);
    const observation = observeDecision(state, side, catalog).observation;
    const input: DecisionInput = { version: 'pplale-decision-v1', decisionId: `decision.${++serial}`, revision, viewer: side, observation };
    const decisionId = input.decisionId;
    // Capture the map independently of the public, mutable JSON input.
    const commands = new Map(actions.map((action, index) => [`action.${index}`, action.command]));
    const command = (current: GameState, selection: ActionSelection): Command => {
        if (current !== state || current.revision !== revision || selection.decisionId !== decisionId)
            throw new Error('Stale or mismatched decision');
        const selected = commands.get(selection.actionId);
        if (!selected) throw new Error('Action was not offered in this decision');
        // Never hand the captured command object to a consumer who could mutate it.
        return JSON.parse(JSON.stringify(selected));
    };
    return { input, command, apply(current: GameState, selection: ActionSelection) {
        return applyCommand(current, command(current, selection), catalog);
    } };
}
