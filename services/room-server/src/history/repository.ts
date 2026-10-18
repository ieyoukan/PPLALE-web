import type { Catalog } from '@pplale/game-core';
import type { Room } from '../rooms.ts';
import type { SnapshotCapture } from './capture.ts';
import type { HistoryPage, MatchDetails, MatchRecording } from '@pplale/game-core/history';

/** Written atomically beside the Redis room CAS; removed only after PostgreSQL commits. */
export interface HistoryWrite {
    id: string;
    room: Room;
    previous: Room | null;
    expires: number;
    capture: SnapshotCapture | null;
    completeAllowed: boolean;
}
export interface HistoryCapture { snapshot: SnapshotCapture | null; completeAllowed: boolean }
export interface HistoryRepository {
    assetIds(): Promise<string[]>;
    putAsset(id: string, data: string, mime: string): Promise<void>;
    asset(id: string): Promise<{ data: string; mime: string } | null>;
    registerCatalog(catalog: Catalog): Promise<string>;
    ingest(write: HistoryWrite): Promise<void>;
    get(id: string): Promise<Room | null>;
    linkGuest(owners: string[]): Promise<void>;
    list(owners: string[], cursor?: string, favorites?: boolean): Promise<HistoryPage>;
    detail(owners: string[], id: string): Promise<MatchDetails | null>;
    recording(owners: string[], id: string): Promise<MatchRecording | null>;
    favorite(owners: string[], id: string, value: boolean): Promise<boolean>;
    ping(): Promise<boolean>;
    close(): Promise<void>;
}
