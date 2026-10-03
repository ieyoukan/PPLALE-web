import { cloneState } from '../core/state.ts';
import { resolveQueue } from '../effects/resolve.ts';
import { RuleError } from '../model.ts';
import type { Catalog, Command, GameState, Result } from '../model.ts';
import { openingCommands } from './opening.ts';
import { advancePhase } from './phases.ts';
import { sandboxCommands } from './sandbox.ts';
import { turnCommands } from './turn.ts';
import type { Handler, Handlers } from './types.ts';

const handlers: Handlers<Command['type']> = { ...openingCommands, ...turnCommands, ...sandboxCommands };

/**
 * The only way to change a match. Returns a new state; on an illegal command returns the previous
 * state unchanged with `error`. `allowAdjust` enables the sandbox test commands.
 */
export function applyCommand(previous: GameState, command: Command, catalog: Catalog, allowAdjust = false): Result {
    const s = cloneState(previous);
    try {
        if (s.winner !== null) throw new RuleError('この対戦は終了しています');
        if (command.type in sandboxCommands && !allowAdjust) throw new RuleError('テスト操作は両側操作モードで利用できます');
        (handlers[command.type] as Handler<typeof command.type>)(s, command, catalog);
        resolveQueue(s, catalog);
        advancePhase(s, catalog);
        if (s.winner !== null) {
            s.pending = null;
            s.queue = [];
        }
        s.revision++;
        return { state: s };
    } catch (error) {
        return { state: previous, error: error instanceof Error ? error.message : '操作できません' };
    }
}
