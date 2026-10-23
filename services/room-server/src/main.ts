// The room server: plays the matches of ルームマッチ (the browsers only see their own side). The
// rooms are kept in Redis, so instances can be added, replaced or lost without ending a match.
import { memoryBackend, redisBackend } from './backend.ts';
import { catalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { remoteHistory } from './history/remote.ts';
import { durableBackend } from './history/backend.ts';
import { createRoomServer } from './server.ts';
import { memoryPushStore, pusher, redisPushStore, vapidKeys } from './push.ts';

const config = loadConfig();
if (!config.redisUrl && !process.env.HISTORY_URL && !process.env.HISTORY_DATABASE_URL) console.warn('REDIS_URL is not set: rooms are kept in this process only and end when it stops (development)');
const transient = config.redisUrl ? await redisBackend(config.redisUrl) : memoryBackend();
const history = process.env.HISTORY_URL ? remoteHistory(process.env.HISTORY_URL) : process.env.HISTORY_DATABASE_URL
    ? await (await import('./history/postgres.ts')).PostgresHistory.open(process.env.HISTORY_DATABASE_URL, process.env.HISTORY_SYNCHRONOUS_COMMIT === 'remote_apply' ? 'remote_apply' : 'on') : undefined;
const backend = history ? await durableBackend(transient, history, { catalog, version: config.version }) : transient;
const keys = vapidKeys();
if (!keys) console.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set: no push notifications are sent');
const push = pusher(config.redisUrl ? await redisPushStore(config.redisUrl) : memoryPushStore(), keys);
const server = createRoomServer({ config, backend, catalog, history, push });
server.listen(config.port, () => console.log(`room-server ${config.version} (${config.pod}) on :${config.port}, rooms in ${backend.kind}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
    void server.shutdown().finally(() => {
        server.close(() => { void Promise.allSettled([backend.close(), push.store.close()]).finally(() => process.exit(0)); });
        // Open keep-alive connections must not hold the pod back.
        server.closeAllConnections();
    });
});
