// サーバーが確定した対戦記録。リプレイは保存済みの状態を表示し、現在のルールで再計算しない。
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
    /** 当時のエンジンで計算した表示値。再生時のクライアントで再計算しない。 */
    presentation: {
        cards: Record<string, { attack: number; hp: number; cost: number }>;
        ppMaximum: [number, number];
        /** 当時のモデルが、保存された完全な盤面から推定した席0の勝率。 */
        assessment?: { win: number; method: 'position-value-v1' };
    };
}
export interface MatchDetails {
    format: 1;
    match: HistoryEntry;
    catalog: Catalog;
}
// サーバーが保存済みハッシュを検証した後で、現在の公開名を解決して返す。
// publicNamesResolvedの場合、ハッシュは表示用の名前ではなく保存時の内容に対応する。
export interface MatchRecording extends MatchDetails { publicNamesResolved?: true; frames: ReplayFrame[]; catalogs: Record<string, Catalog> }
