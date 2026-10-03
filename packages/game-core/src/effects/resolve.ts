// Runs queued steps in order until one waits for a choice.
import { allScripts } from '../cards/registry.ts';
import type { OpDef } from '../cards/types.ts';
import { settle } from '../core/zones.ts';
import { allSkills } from '../playables/skills.ts';
import type { Catalog, GameState, Task, TaskOp } from '../model.ts';
import { effects } from './context.ts';
import { genericOps } from './ops.ts';
import { selectable, unitsInScope } from './targets.ts';

let table: Map<TaskOp, OpDef> | undefined;
/** Generic steps plus the ones declared by cards and skills. */
export function opDef(op: TaskOp): OpDef | undefined {
    if (!table) {
        table = new Map();
        for (const ops of [genericOps, ...allScripts().map(s => s.ops), ...allSkills().map(s => s.ops)]) {
            for (const [name, def] of Object.entries(ops ?? {})) table.set(name as TaskOp, def);
        }
    }
    return table.get(op);
}

function execute(s: GameState, t: Task, catalog: Catalog) {
    const def = opDef(t.op);
    if (!def) throw new Error(`未知の効果です: ${t.op}`);
    const fx = effects(s, catalog, t.actor, t.source, t.multiplier ?? 1);
    if (def.target === 'unit' && !t.target) {
        // Fix the candidates on the first ask so repeats cannot widen the choice (taunt FAQ).
        const scoped = unitsInScope(s, t);
        const candidates = t.candidates ?? selectable(s, t.actor, scoped);
        const remaining = candidates.filter(id => scoped.includes(id) && !(t.ids ?? []).includes(id));
        fx.pick('対象の幼女を選んでください', remaining, { ...t, candidates });
        return;
    }
    def.run(fx, t);
}

/** Resolves the queue, removing 0-HP units after every step. Stops at a pending choice or a winner. */
export function resolveQueue(s: GameState, catalog: Catalog) {
    let limit = 0;
    settle(s, catalog);
    while (s.queue.length && !s.pending && s.winner === null) {
        if (++limit > 500) throw new Error('効果の解決が上限に達しました');
        execute(s, s.queue.shift()!, catalog);
        settle(s, catalog);
    }
}
