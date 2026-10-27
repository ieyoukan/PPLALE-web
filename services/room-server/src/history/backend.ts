import type { Catalog } from '@pplale/game-core';
import { archiveCatalog } from './assets.ts';
import { captureState } from './capture.ts';
import { RoomError } from '../rooms.ts';
import type { Room } from '../rooms.ts';
import type { Backend } from '../backend.ts';
import type { HistoryRepository, HistoryCapture } from './repository.ts';

/** The same room, not another one made later under the same id (its first seat's secret, or its plaza's key). */
const sameRoom = (a: Room, b: Room) => a.plaza || b.plaza ? a.plaza?.key === b.plaza?.key : a.seats[0]?.tokenHash === b.seats[0]?.tokenHash;

/** Redis remains the common room authority for both old and new pods during rolling updates.
 * A Redis CAS atomically queues its archive write. Acknowledgement/publication waits for PG.
 * The queue has no TTL and survives a pod crash between the CAS and the archive commit.
 */
export async function durableBackend(redis: Backend, history: HistoryRepository, engine: { catalog: Catalog; version: string; archiveImages?: boolean }): Promise<Backend> {
    const catalogId = await history.registerCatalog(engine.archiveImages === false ? engine.catalog : await archiveCatalog(engine.catalog, history));
    const capture = async (room?: Room): Promise<HistoryCapture> => ({
        snapshot: room?.state ? captureState(room.state, engine.catalog, catalogId, engine.version) : null,
        // A pre-feature pod can mutate a room without recording it. Never label these matches complete.
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
                // This particular Redis snapshot must be archived before a reader sees it.
                await drain();
                const saved = await history.get(id);
                // Repair Redis AOF rollback as well as a completely missing Redis room.
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
        async replaceFreeMatchQueue(queue, expected, room, ttl) {
            await drain();
            const changed = await redis.replaceFreeMatchQueue(queue, expected, room, ttl, room ? await capture(room) : undefined);
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
