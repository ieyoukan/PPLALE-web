// Order-invariant card sets. The identical data transformation lives in research/cpu/pooling.py.
import { encodeFeatures } from './encode.ts';
import { researchSchema } from './schema.ts';
import type { FeatureSpec, ResearchCatalog, ResearchSchema } from './types.ts';
import type { GameObservation } from '../gameplay/types.ts';

export const POOL_VERSION = 'pplale-pooled-v1' as const;
export function poolSpec(schema: ResearchSchema = researchSchema) {
    return { version: POOL_VERSION, textBins: 24, divisor: 7, clip: 8, zones: ['hand', 'field', 'nap', 'exile', 'choice'],
        context: schema.context, player: schema.player,
        printed: schema.card.filter(spec => spec.path[0] === 'definition'),
        current: schema.card.filter(spec => spec.path[0] === 'current') };
}
export type PoolSpec = ReturnType<typeof poolSpec>;
const flatten = (data: unknown, specs: FeatureSpec[]) => {
    const vector = encodeFeatures(data, specs);
    return [...vector.values, ...vector.known.map(Number)];
};

// Compile getters once for search-time current fields. Printed vectors are already cached by card.
function currentEncoder(specs: FeatureSpec[]) {
    const program = specs.map(spec => ({ ...spec, path: [...spec.path] }));
    return (card: unknown): number[] => {
        const values: number[] = [], known: number[] = [];
        for (const spec of program) {
            let raw: unknown = card;
            for (const part of spec.path) raw = raw && typeof raw === 'object' && Object.hasOwn(raw, part) ? (raw as Record<string, unknown>)[part] : null;
            if (raw === null || raw === undefined) { values.push(0); known.push(0); continue; }
            let value: number;
            if (spec.kind === 'number') { if (typeof raw !== 'number') throw new Error('Expected pooled number'); value = raw; }
            else if (spec.kind === 'boolean') { if (typeof raw !== 'boolean') throw new Error('Expected pooled boolean'); value = Number(raw); }
            else if (Array.isArray(raw) && spec.kind === 'length') value = raw.length;
            else if (Array.isArray(raw) && spec.kind === 'contains') value = Number(raw.includes(spec.value));
            else throw new Error(`Unsupported current feature: ${spec.name}`);
            if (!Number.isFinite(value)) throw new Error('Non-finite pooled feature');
            values.push(Math.fround(value / spec.scale)); known.push(1);
        }
        return [...values, ...known];
    };
}

/** Signed FNV-1a over Unicode code-point 2/3-grams. No card ID or learned vocabulary. */
export function textFeatures(text: string, bins: number): number[] {
    const chars = [...text].slice(0, 512), values = Array<number>(bins).fill(0);
    let tokens = 0;
    for (const size of [2, 3]) for (let i = 0; i + size <= chars.length; i++) {
        let hash = 2166136261;
        for (let j = 0; j < size; j++) hash = Math.imul(hash ^ chars[i + j].codePointAt(0)!, 16777619) >>> 0;
        values[hash % bins] += hash & 0x80000000 ? -1 : 1;
        tokens++;
    }
    return values.map(value => Math.fround(value / Math.sqrt(Math.max(1, tokens))));
}

export function poolNames(spec: PoolSpec): string[] {
    const vector = (prefix: string, features: FeatureSpec[]) => [
        ...features.map(f => `${prefix}.${f.name}`), ...features.map(f => `${prefix}.known.${f.name}`)];
    const printed = [...vector('printed', spec.printed), ...Array.from({ length: spec.textBins }, (_, i) => `text.${i}`),
        'effects.count', 'effects.amount', 'effects.hp', 'effects.unknown'];
    const card = [...printed, ...vector('current', spec.current)];
    return [...vector('context', spec.context), ...[0, 1].flatMap(side => [
        ...vector(`player.${side}`, spec.player), ...printed.map(name => `leader.${side}.${name}`),
        `player.${side}.skillCount`, `player.${side}.uses`, `player.${side}.used`, `player.${side}.extraUses`,
        ...spec.zones.flatMap(zone => [`${side}.${zone}.count`, ...card.map(name => `${side}.${zone}.${name}`)])])];
}

/** Cache immutable printed cards; only current state fields are encoded at each search leaf. */
export function createPoolEncoder(catalog: ResearchCatalog, spec: PoolSpec = poolSpec()) {
    if (spec.version !== POOL_VERSION || spec.textBins !== 24 || spec.divisor !== 7 || spec.clip !== 8
        || JSON.stringify(spec.zones) !== JSON.stringify(['hand', 'field', 'nap', 'exile', 'choice'])) throw new Error('Unsupported pooling contract');
    const printed = new Map<string, number[]>();
    const describe = (id: string | null): number[] => {
        const key = id ?? '?';
        if (printed.has(key)) return printed.get(key)!;
        const definition = id === null ? null : catalog[id];
        if (id !== null && !definition) throw new Error(`Unknown pooled card: ${id}`);
        const effects = definition?.effects ?? [];
        const text = definition ? [definition.effect, definition.role, ...definition.skills.map(s => s.name), definition.passive?.name ?? ''].join('\n') : '';
        const values = [...flatten({ definition }, spec.printed), ...textFeatures(text, spec.textBins), effects.length / 5,
            effects.reduce((sum, effect) => sum + (effect.amount ?? 0), 0) / 10,
            effects.reduce((sum, effect) => sum + (effect.hp ?? 0), 0) / 10,
            definition?.coverage === 'complete' ? 0 : 1];
        printed.set(key, values);
        return values;
    };
    const width = describe(null).length + spec.current.length * 2;
    const current = currentEncoder(spec.current);
    return (observation: GameObservation): Float32Array => {
        const vector = flatten(observation, spec.context);
        for (const side of [0, 1] as const) {
            const p = observation.players[side];
            vector.push(...flatten(p, spec.player), ...describe(p.playable), p.skills.length / 10,
                p.skills.reduce((sum, n) => sum + Math.max(0, n ?? 0), 0) / 10,
                p.skillHistory.reduce((sum, n) => sum + n, 0) / 10,
                p.extraSkills.reduce((sum, skill) => sum + skill.uses, 0) / 10);
            for (const zone of spec.zones) {
                const pool = Array<number>(width).fill(0);
                let count = 0;
                for (const card of observation.cards) if (card.side === side && card.zone === zone) {
                    const row = [...describe(card.cardId), ...current(card)];
                    row.forEach((value, index) => { pool[index] += value; });
                    count++;
                }
                vector.push(count / spec.divisor, ...pool.map(value => value / spec.divisor));
            }
        }
        return Float32Array.from(vector, value => Math.max(-spec.clip, Math.min(spec.clip, value)));
    };
}
