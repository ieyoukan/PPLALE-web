type Kind = 'cpu' | 'assess';
type Prepared = { worker: Worker; ready: Promise<void>; expiry?: ReturnType<typeof setTimeout> };
const prepared = new Map<Kind, Prepared>();

export function createGameWorker(kind: Kind) {
  return kind === 'cpu'
    ? new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./assess.worker.ts', import.meta.url), { type: 'module' });
}

// Worker内の準備完了を待ち、準備済みの同じWorkerを盤面へ渡す。
export async function prepareGameWorker(kind: Kind): Promise<void> {
  const cached = prepared.get(kind);
  if (cached) return cached.ready;
  const worker = createGameWorker(kind);
  const entry: Prepared = { worker, ready: Promise.resolve() };
  entry.ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => fail(), 30_000);
    const clean = () => { clearTimeout(timeout); worker.removeEventListener('message', ready); worker.removeEventListener('error', fail); };
    const ready = (event: MessageEvent) => {
      if (event.data?.type !== 'pplale-ready') return;
      clean();
      entry.expiry = setTimeout(() => { if (prepared.get(kind) === entry) { worker.terminate(); prepared.delete(kind); } }, 300_000);
      resolve();
    };
    const fail = () => { clean(); worker.terminate(); prepared.delete(kind); reject(new Error('対戦データを準備できませんでした')); };
    worker.addEventListener('message', ready);
    worker.addEventListener('error', fail);
  });
  prepared.set(kind, entry);
  return entry.ready;
}

export function takeGameWorker(kind: Kind) {
  const entry = prepared.get(kind);
  if (!entry) return createGameWorker(kind);
  clearTimeout(entry.expiry);
  prepared.delete(kind);
  return entry.worker;
}
