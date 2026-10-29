import type { Catalog } from '@pplale/game-core';
import { archiveCatalog } from './assets.ts';
import { captureState } from './capture.ts';
import { RoomError } from '../rooms.ts';
import type { Room } from '../rooms.ts';
import type { Backend } from '../backend.ts';
import type { HistoryRepository, HistoryCapture } from './repository.ts';

/** ルームIDが同じでも、作成時のキーが異なれば別のルームとして扱う。 */
const sameRoom = (a: Room, b: Room) => a.plaza || b.plaza ? a.plaza?.key === b.plaza?.key : a.seats[0]?.tokenHash === b.seats[0]?.tokenHash;

/** 更新中もRedisをルームの正本にする。CASと履歴の保存待ち登録を同時に行い、PostgreSQL保存後に応答・公開する。保存待ちデータはPodの停止でも消さない。 */
export async function durableBackend(redis: Backend, history: HistoryRepository, engine: { catalog: Catalog; version: string; archiveImages?: boolean }): Promise<Backend> {
    const catalogId = await history.registerCatalog(engine.archiveImages === false ? engine.catalog : await archiveCatalog(engine.catalog, history));
    const capture = async (room?: Room): Promise<HistoryCapture> => ({
        snapshot: room?.state ? captureState(room.state, engine.catalog, catalogId, engine.version) : null,
        // 旧Podで受理した操作は記録が欠けるため、完全なリプレイと表示しない。
        completeAllowed: await redis.historyReady(),
    });
    let draining: Promise<void> | undefined;
    async function drain(): Promise<void> {
        if (draining) { await draining; return drain(); }
        return draining = (async () => {
        for (;;) {
            const batch = await redis.historyPending();
            if (!batch.length) return;
            for (const write of batch) {
                await history.ingest(write);
                await redis.historyAck(write.id);
            }
        }
        })().finally(() => { draining = undefined; });
    }
    await drain();
    const retry = setInterval(() => { void drain().catch(error => console.error('history outbox', error instanceof Error ? error.message : 'unavailable')); }, 1000);
    retry.unref();
    return {
        ...redis,
        async create(room, ttl) {
            await drain();
            const changed = await redis.create(room, ttl, await capture(room));
            if (changed) await drain();
            return changed;
        },
        async get(id) {
            for (let attempt = 0; attempt < 6; attempt++) {
                const room = await redis.get(id);
                // このRedisの状態を履歴へ保存してから、読み取り側へ返す。
                await drain();
                const saved = await history.get(id);
                // Redisの消失と、AOFの巻き戻りの両方を、確認済みの履歴から復旧する。
                if (room && saved && saved.version > room.version && sameRoom(saved, room)) {
                    await redis.replace(saved, room.version, 60_000);
                    continue;
                }
                if (room || !saved) return room;
                await redis.create(saved, 60_000);
            }
            throw new RoomError(503, '再接続しています。少しお待ちください');
        },
        async replace(room, expected, ttl) {
            await drain();
            const changed = await redis.replace(room, expected, ttl, await capture(room));
            if (changed) await drain();
            return changed;
        },
        async beat(pod, connections, ttl) {
            await redis.historyCapable(pod, ttl);
            await redis.beat(pod, connections, ttl);
        },
        async ping() { const [a, b] = await Promise.all([redis.ping(), history.ping()]); return a && b; },
        async close() { clearInterval(retry); await draining?.catch(() => {}); await Promise.all([redis.close(), history.close()]); },
    };
}
