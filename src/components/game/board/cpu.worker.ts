// Runs the CPU off the main thread: deep searches (さいきょう) must not freeze the board.
import { cpuCommand } from '@pplale/game-core/ai';
import type { Command, CpuLevel, GameState, Side } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';

export type CpuRequest = { id: number; game: GameState; level: CpuLevel; side: Side };
export type CpuResponse = { id: number; command: Command | null };

const scope = self as unknown as Worker;
scope.addEventListener('message', (event: MessageEvent<CpuRequest>) => {
  const { id, game, level, side } = event.data;
  scope.postMessage({ id, command: cpuCommand(game, gameCatalog, { level, side }) } satisfies CpuResponse);
});
