import type { Catalog, Rules } from '../model.ts';
import { describeRules } from './rulebook.ts';
import { listCardDefinitions, listExSkills } from './catalog.ts';
import { listCommandDefinitions } from './commands.ts';

export { describeRules } from './rulebook.ts';
export { describeCard, listCardDefinitions, listExSkills } from './catalog.ts';
export type { CardDefinition } from './catalog.ts';
export { commandDefinitions, listCommandDefinitions } from './commands.ts';
export { actingSides, actionCandidates, actionCost, legalActions, inspectActions, enumerateActionLines } from './actions.ts';
export type { LegalAction, ActionCost, ActionLine } from './actions.ts';
export { bindDecision } from './decision.ts';
export type { ActionSelection, DecisionInput } from './decision.ts';
export { observeDecision, observeGame, observeState } from './observation.ts';
export { OBSERVATION_VERSION } from './types.ts';
export type { GameObservation, ObservedCard, ObservedPlayer, ObservedAction } from './types.ts';

export const describeGame = (catalog: Catalog, rules?: Rules) => ({
    version: 'pplale-gameplay-v1' as const,
    rules: describeRules(rules), commands: listCommandDefinitions(), cards: listCardDefinitions(catalog), exSkills: listExSkills(),
});
