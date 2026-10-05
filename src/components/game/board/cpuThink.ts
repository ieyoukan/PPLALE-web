// One CPU decision, in the worker or (without one) on the main thread.
import { cpuCommand, createMaster, createValueEvaluator, parseValueModel } from '@pplale/game-core/ai';
import type { Command, CpuLevel, CpuStrategy, GameState, Side } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import type { ServedModel } from '@/lib/game/cpuServer';

export type CpuRequest = {
  id: number; game: GameState; level: CpuLevel; side: Side;
  /** The CPU server's model for さいきょう, if there is one. */
  served?: ServedModel | null;
};
export type CpuResponse = {
  id: number; command: Command | null;
  /** Version of the model さいきょう decided with; absent for the other levels. */
  model?: string;
};

/** Reported when さいきょう played with the model built into the app. */
const BUILT_IN = 'built-in';
let latest: { version: string; strategy: CpuStrategy | null } | null = null;
/** さいきょう with the served model. Null when there is none or it does not fit this build's features. */
function servedMaster(served: ServedModel | null | undefined): CpuStrategy | null {
  if (!served) return null;
  if (latest?.version !== served.version) {
    const model = parseValueModel(served.model);
    latest = { version: served.version, strategy: model && createMaster({ evaluate: createValueEvaluator(model) }) };
  }
  return latest.strategy;
}

export function think({ id, game, level, side, served }: CpuRequest): CpuResponse {
  if (level !== 'master') return { id, command: cpuCommand(game, gameCatalog, { level, side }) };
  const strategy = servedMaster(served);
  return { id, command: cpuCommand(game, gameCatalog, strategy ? { strategy, side } : { level, side }), model: strategy ? served!.version : BUILT_IN };
}
