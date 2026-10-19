// Immutable, server-authored recordings. Playback displays these states; it never runs newer rules.
import type { Catalog, Deck, GameState, Side } from './model.ts';
import type { RoomCommand, RoomRules } from './room.ts';

export type MatchEnd = 'normal' | 'resign' | 'disconnect' | 'leave' | 'abandoned';
export interface RecordedPlayer { name: string; profileId?: string; deck: Deck; playableName: string }
export interface MatchSummary {
    id: string;
    mode: 'free' | 'room';
    startedAt: number;
    endedAt: number;
    players: [RecordedPlayer, RecordedPlayer];
    rules: RoomRules;
    winner: Side | null;
    reason: MatchEnd;
    turns: number;
    points: [number, number];
    firstPlayer: Side;
    frames: number;
    complete: boolean;
    engineVersion: string;
}
export interface HistoryEntry extends MatchSummary { seat: Side; favorite: boolean; watching?: true }
export interface HistoryPage { entries: HistoryEntry[]; cursor: string | null }
export interface ReplayFrame {
    sequence: number;
    catalogId: string;
    engineVersion: string;
    at: number;
    state: GameState;
    command: RoomCommand | null;
    event: 'start' | 'command' | MatchEnd;
    hash: string;
    previousHash: string;
    /** Display values computed by the original engine, never recalculated by a newer client. */
    presentation: {
        cards: Record<string, { attack: number; hp: number; cost: number }>;
        ppMaximum: [number, number];
        /** Side 0's chance, estimated from the fully recorded position by the original model. */
        assessment?: { win: number; method: 'position-value-v1' };
    };
}
export interface MatchDetails {
    format: 1;
    match: HistoryEntry;
    catalog: Catalog;
}
// The server checks archived hashes before resolving current public names for delivery.
// With publicNamesResolved, hashes describe the original archive, not the display projection.
export interface MatchRecording extends MatchDetails { publicNamesResolved?: true; frames: ReplayFrame[]; catalogs: Record<string, Catalog> }
