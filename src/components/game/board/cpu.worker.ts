// Runs the CPU off the main thread: deep searches (さいきょう) must not freeze the board.
import { think } from './cpuThink';
import type { CpuRequest } from './cpuThink';

export type { CpuRequest, CpuResponse } from './cpuThink';

const scope = self as unknown as Worker;
scope.addEventListener('message', (event: MessageEvent<CpuRequest>) => scope.postMessage(think(event.data)));
