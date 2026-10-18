import type { RoomLatency } from '@pplale/game-core/room';

export type CommandTiming = Record<'queue' | 'read' | 'apply' | 'store' | 'presence' | 'deliver' | 'publish' | 'total', number>;
export const commandTiming = (): CommandTiming => ({ queue: 0, read: 0, apply: 0, store: 0, presence: 0, deliver: 0, publish: 0, total: 0 });

/** Bounded per-process samples. No room ids, commands, names or cards are retained. */
export function roomLatency(capacity = 256) {
    const samples: CommandTiming[] = [];
    let count = 0;
    return {
        record(sample: CommandTiming) {
            samples[count++ % capacity] = { ...sample };
        },
        snapshot(): RoomLatency {
            const milliseconds = Object.fromEntries(Object.keys(commandTiming()).map(stage => {
                const values = samples.map(s => s[stage as keyof CommandTiming]).sort((a, b) => a - b);
                const at = (q: number) => Math.round((values[Math.max(0, Math.ceil(values.length * q) - 1)] ?? 0) * 100) / 100;
                return [stage, { p50: at(.5), p95: at(.95), max: at(1) }];
            })) as RoomLatency['milliseconds'];
            return { count, samples: samples.length, milliseconds };
        },
    };
}
