// The room server: plays the matches of ルームマッチ (the browsers only see their own side). The
// rooms are kept in Redis, so instances can be added, replaced or lost without ending a match.
import { memoryBackend, redisBackend } from './backend.ts';
import { catalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { createRoomServer } from './server.ts';

const config = loadConfig();
if (!config.redisUrl) console.warn('REDIS_URL is not set: rooms are kept in this process only and end when it stops (development)');
const backend = config.redisUrl ? await redisBackend(config.redisUrl) : memoryBackend();
const server = createRoomServer({ config, backend, catalog });
server.listen(config.port, () => console.log(`room-server ${config.version} (${config.pod}) on :${config.port}, rooms in ${backend.kind}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
    void server.shutdown().finally(() => {
        server.close(() => { void backend.close().finally(() => process.exit(0)); });
        // Open keep-alive connections must not hold the pod back.
        server.closeAllConnections();
    });
});
