import { warmRoomCards } from './room/warmAssets';
import type { AssetProgress } from './room/warmAssets';
import { servedModel } from './cpuServer';

let boardCode: Promise<void> | undefined;
function prepareCode() {
  boardCode ??= Promise.all([
    import('@/components/game/BoardEmulator'),
    import('@/components/game/MulliganBoard'),
    import('@/components/game/openingDieScene'),
    import('@pplale/game-core/snapshot'),
  ]).then(() => {}).catch(error => { boardCode = undefined; throw error; });
  return boardCode;
}

export async function prepareMatchAssets(ids: string[], { cpu = false, master = false, progress, signal, decode = true }: {
  cpu?: boolean; master?: boolean; progress?: (value: AssetProgress) => void; signal?: AbortSignal; decode?: boolean;
} = {}) {
  signal?.throwIfAborted();
  await Promise.all([
    warmRoomCards(ids, signal, progress, decode),
    prepareCode().then(async () => {
      await document.fonts.load('400 20px BoardHandwriting', '0123456789PPお菓子ポイント引く');
      if (cpu) {
        const { prepareGameWorker } = await import('@/components/game/board/preparedWorkers');
        await Promise.all([
          prepareGameWorker('cpu').catch(async () => { await import('@/components/game/board/cpuThink'); }),
          prepareGameWorker('assess').catch(() => {}),
          master ? servedModel() : Promise.resolve(),
        ]);
      }
    }),
  ]);
  signal?.throwIfAborted();
}
