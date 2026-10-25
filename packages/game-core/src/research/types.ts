// JSON-only research contracts. No engine execution, model, scoring, or Node dependencies.
import type { CardDefinition } from '../gameplay/catalog.ts';
import type { describeRules } from '../gameplay/rulebook.ts';
import type { CommandDefinition } from '../gameplay/commands.ts';
import type { ResearchEffect } from '../cards/types.ts';
import type { GameObservation as ResearchObservation, ObservedAction } from '../gameplay/types.ts';
import { OBSERVATION_VERSION } from '../gameplay/types.ts';
export const RESEARCH_VERSION = OBSERVATION_VERSION;
export type { ResearchEffect, ResearchAnnotation } from '../cards/types.ts';
export type { GameObservation as ResearchObservation, ObservedCard, ObservedPlayer, ObservedAction } from '../gameplay/types.ts';

export interface ResearchCard {
    id: string;
    name: string;
    effect: string;
    role: string;
    printVersion: string;
    deck: CardDefinition['deck'];
    play: CardDefinition['play'];
    skills: CardDefinition['skills'];
    passive: CardDefinition['passive'];
    type: string;
    fruit: string;
    cost: number;
    attack: number;
    hp: number;
    sweetType: string | null;
    keywords: string[];
    hooks: string[];
    evasion: number | null;
    actionsPerTurn: number;
    maxDamage: number | null;
    unharmedAttacking: boolean;
    revealable: boolean;
    variableCost: boolean;
    implemented: boolean;
    coverage: 'unannotated' | 'partial' | 'complete';
    effects: ResearchEffect[];
}
export type ResearchCatalog = Record<string, ResearchCard>;

/** The same small interpreter is used in TS and Python; schemas carry all normalization. */
export interface FeatureSpec {
    name: string;
    path: string[];
    kind: 'number' | 'boolean' | 'length' | 'contains' | 'equals';
    scale: number;
    value?: string;
}
export interface ResearchSchema {
    version: typeof RESEARCH_VERSION;
    context: FeatureSpec[];
    player: FeatureSpec[];
    card: FeatureSpec[];
    effect: FeatureSpec[];
    action: FeatureSpec[];
}
export interface FeatureVector {
    values: number[];
    known: boolean[];
    /** New categories remain visible rather than silently becoming all-zero features. */
    unmapped: Record<string, string[]>;
}
export interface EncodedObservation {
    version: typeof RESEARCH_VERSION;
    context: FeatureVector;
    players: FeatureVector[];
    cards: { ref: string; cardId: string | null; vector: FeatureVector; effects: FeatureVector[] }[];
    options: { ref: string; value: string | null; card: string | null }[];
    actions: (ObservedAction & { vector: FeatureVector })[];
}

export interface ResearchManifest {
    type: 'manifest';
    version: typeof RESEARCH_VERSION;
    schema: ResearchSchema;
    catalog: ResearchCatalog;
    schemaHash: string;
    catalogHash: string;
    /** Optional for older v1 datasets; new exports include the executable game's description. */
    game?: { rules: ReturnType<typeof describeRules>; commands: CommandDefinition[]; exSkills: { id: string; name: string; cost: number; automatic: boolean; description: string }[] };
    gameHash?: string;
    provenance: {
        engineCommit: string;
        engineHash: string;
        rulesEngineHash?: string;
        definitionsHash: string;
        exporterHash: string;
        workingTreeDirty: boolean;
        seedStart: number;
        games: number;
        share: number;
        maxCommands: number;
        runtime: string;
        deckGenerator: string;
        sampling: string;
        splitPolicy?: string;
        exploration?: number;
        levels: [string, string];
        rules: Record<string, number | string>;
    };
}
export interface ResearchSample {
    type: 'decision';
    matchId: string;
    step: number;
    viewer: 0 | 1;
    split: 'train' | 'validation' | 'test';
    observation: ResearchObservation;
    selectedAction: number;
    /** Targets are outside observations/encoding. null means the match did not finish. */
    outcome: 'win' | 'loss' | 'draw' | 'unfinished';
}
