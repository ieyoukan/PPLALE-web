import type { Catalog, Command, GameState } from '../model.ts';

export type CommandType = Command['type'];
/** Mutates the cloned state for one command, or throws RuleError to reject it. */
export type Handler<T extends CommandType> = (s: GameState, command: Extract<Command, { type: T }>, catalog: Catalog) => void;
export type Handlers<K extends CommandType> = { [T in K]: Handler<T> };
