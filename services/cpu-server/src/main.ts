// The CPU server: collects finished matches against さいきょう, keeps training its value model on
// them, and serves the current model to the game (which still thinks in the browser).
import { catalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { createApi } from './http.ts';
import { openStore } from './store.ts';
import { startTrainer } from './trainer.ts';

const config = loadConfig(), store = openStore(config.dataDir);
const api = createApi({ config, store, catalog, training: () => trainer.running(), onReport: () => trainer.check() });
const trainer = startTrainer({ config, store, onFinished: () => api.reloadModel() });
api.listen(config.port, () => console.log(`cpu-server ${config.version} on :${config.port}, model ${store.currentModel().version}, ${store.reportCount()} matches`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
    trainer.stop();
    api.close(() => process.exit(0));
    // Open keep-alive connections must not hold the pod back.
    api.closeAllConnections();
});
