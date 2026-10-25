// Player-facing JSON contracts shared by game clients and research.
import type { ActionCost } from '../core/actions.ts';

// Keep the existing wire version; moving the contract does not change its JSON shape.
export const OBSERVATION_VERSION = 'pplale-research-v1' as const;

export interface ObservedCard {
    /** Observation-local reference; engine uids can reveal the original deck assignment. */
    ref: string;
    cardId: string | null;
    side: 0 | 1;
    zone: 'hand' | 'field' | 'nap' | 'exile' | 'choice';
    current: {
        cost: number;
        attack: number;
        hp: number;
        damage: number;
        attackBonus: number;
        hpBonus: number;
        costDelta: number;
        temporaryCost: number;
        keywords: string[];
        fruits: string[];
        exhausted: boolean;
        enteredThisTurn: boolean;
        entered: number;
        ateOn: number;
        immobileUntil: number | null;
        immobile: boolean;
        shield: boolean;
        hiding: boolean;
        silenced: boolean;
        revealed: boolean;
        evasion: number | null;
        actions: number;
        owner: 0 | 1;
        timedFruits: Record<string, number>;
        links: string[];
    } | null;
}

export interface ObservedPlayer {
    side: 0 | 1;
    playable: string;
    points: number;
    maxPoints: number;
    pp: number;
    maxPp: number;
    turns: number;
    nextPpDebt: number;
    handCount: number;
    yojoCount: number;
    sweetCount: number;
    shield: boolean;
    skills: number[];
    skillHistory: number[];
    extraSkills: { playable: string; index: number; uses: number }[];
    exSkills: Record<string, { uses: number; lastTurn?: number; usedThisTurn?: number }>;
    played: string[];
    milestones: number[];
    lastingFruits: string[];
    resources: Record<string, number>;
}

export interface ObservedAction {
    id: string;
    type: string;
    source: string | null;
    target: string | null;
    targetLeader: boolean;
    option: string | null;
    deck: string | null;
    mode: string | null;
    skill: string | null;
    index: number | null;
    order: string | null;
    cards: string[];
    cost: ActionCost;
}

/** Player 0 is always the viewer. No RNG, queue, deck order, hidden identities or labels. */
export interface GameObservation {
    version: typeof OBSERVATION_VERSION;
    phase: string;
    turn: number;
    active: 0 | 1;
    first: 0 | 1;
    winner: 0 | 1 | 'draw' | null;
    players: [ObservedPlayer, ObservedPlayer];
    cards: ObservedCard[];
    pending: {
        actor: 0 | 1;
        operation: string;
        source: string | null;
        step: string | null;
        amount: number | null;
        hp: number | null;
        count: number | null;
        keyword: string | null;
        options: { ref: string; value: string | null; card: string | null }[];
    } | null;
    actions: ObservedAction[];
    /** Optional diagnostics; these candidates cannot be selected as legal action IDs. */
    unavailable?: (ObservedAction & { error: string })[];
}

