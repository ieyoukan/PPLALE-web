// The room server: keeps the rooms of ルームマッチ and plays their matches (the browsers only see
// their own side). Rooms are also written to DATA_DIR, so a restart does not end them.
import { catalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { createRoomServer } from './server.ts';
import { openStore } from './store.ts';

const config = loadConfig(), store = openStore(config.dataDir);
const server = createRoomServer({ config, store, catalog });
server.sweep();
server.listen(config.port, () => console.log(`room-server ${config.version} on :${config.port}, ${store.all().length} rooms`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
    server.shutdown();
    server.close(() => process.exit(0));
    // Open keep-alive connections must not hold the pod back.
    server.closeAllConnections();
});
