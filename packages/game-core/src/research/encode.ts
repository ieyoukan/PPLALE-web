import { RESEARCH_VERSION } from './types.ts';
import type { EncodedObservation, FeatureSpec, FeatureVector, ResearchCatalog, ResearchObservation, ResearchSchema } from './types.ts';
import { researchSchema } from './schema.ts';

function readPath(value: unknown, path: string[]): unknown {
    for (const part of path) {
        if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(part)) return null;
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return null;
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}

/** Interpret data, not the game. The schema (including divisors) travels with a dataset. */
export function encodeFeatures(data: unknown, specs: FeatureSpec[]): FeatureVector {
    for (const spec of specs) {
        if (!['number', 'boolean', 'length', 'contains', 'equals'].includes(spec.kind))
            throw new Error(`Unknown feature kind: ${spec.kind}`);
        if (!Array.isArray(spec.path) || spec.path.some(part => typeof part !== 'string' || part.includes('.')))
            throw new Error(`Invalid feature path: ${spec.name}`);
    }
    const unmapped: Record<string, string[]> = {};
    const groups = new Map<string, Set<string>>();
    for (const spec of specs) if (spec.kind === 'contains' || spec.kind === 'equals') {
        const path = spec.path.join('.'), vocabulary = groups.get(path) ?? new Set<string>();
        if (typeof spec.value !== 'string') throw new Error(`Missing feature category: ${spec.name}`);
        vocabulary.add(spec.value);
        groups.set(path, vocabulary);
    }
    for (const [path, vocabulary] of groups) {
        const value = readPath(data, path.split('.'));
        const unknown = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
            .filter(item => typeof item === 'string' && !vocabulary.has(item));
        if (unknown.length) unmapped[path] = [...new Set<string>(unknown)].sort();
    }
    const known: boolean[] = [];
    const names = new Set<string>();
    const values = specs.map(spec => {
        if (names.has(spec.name)) throw new Error(`Duplicate feature name: ${spec.name}`);
        names.add(spec.name);
        if (!Number.isFinite(spec.scale) || spec.scale <= 0) throw new Error(`Invalid feature scale: ${spec.name}`);
        const raw = readPath(data, spec.path);
        const available = raw !== undefined && raw !== null && !(spec.kind === 'equals' && unmapped[spec.path.join('.')]);
        known.push(!!available);
        if (!available) return 0;
        let value: number;
        switch (spec.kind) {
            case 'number':
                if (typeof raw !== 'number') throw new Error(`Expected number: ${spec.name}`);
                value = raw; break;
            case 'boolean':
                if (typeof raw !== 'boolean') throw new Error(`Expected boolean: ${spec.name}`);
                value = raw ? 1 : 0; break;
            case 'length':
            case 'contains':
                if (!Array.isArray(raw)) throw new Error(`Expected array: ${spec.name}`);
                value = spec.kind === 'length' ? raw.length : raw.includes(spec.value) ? 1 : 0; break;
            case 'equals':
                if (typeof raw !== 'string') throw new Error(`Expected category: ${spec.name}`);
                value = raw === spec.value ? 1 : 0; break;
            default: throw new Error(`Unknown feature kind: ${spec.kind}`);
        }
        const normalized = Math.fround(value / spec.scale);
        if (!Number.isFinite(normalized)) throw new Error(`Non-finite feature: ${spec.name}`);
        return normalized;
    });
    return { values, known, unmapped };
}

export function encodeObservation(observation: ResearchObservation, catalog: ResearchCatalog, schema: ResearchSchema = researchSchema): EncodedObservation {
    if (observation.version !== RESEARCH_VERSION || schema.version !== RESEARCH_VERSION)
        throw new Error('Unsupported research schema/observation version');
    return {
        version: RESEARCH_VERSION,
        context: encodeFeatures(observation, schema.context),
        players: observation.players.map(player => encodeFeatures(player, schema.player)),
        cards: observation.cards.map(card => {
            const definition = card.cardId === null ? null : catalog[card.cardId];
            if (card.cardId !== null && !definition) throw new Error(`Card absent from research catalog: ${card.cardId}`);
            return {
                ref: card.ref, cardId: card.cardId,
                vector: encodeFeatures({ ...card, definition }, schema.card),
                effects: (definition?.effects ?? []).map(effect => encodeFeatures(effect, schema.effect)),
            };
        }),
        options: (observation.pending?.options ?? []).map(option => ({ ...option })),
        actions: observation.actions.map(action => ({ ...action, cards: [...action.cards], vector: encodeFeatures(action, schema.action) })),
    };
}

/** Stable JSON for provenance hashes. Also rejects non-JSON numerical values. */
export function canonicalJson(value: unknown): string {
    const normalize = (v: unknown): unknown => {
        if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Non-finite research JSON');
        if (Array.isArray(v)) return v.map(normalize);
        if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort()
            .filter(key => (v as Record<string, unknown>)[key] !== undefined)
            .map(key => [key, normalize((v as Record<string, unknown>)[key])]));
        return v;
    };
    return JSON.stringify(normalize(value));
}

/** Cross-language digest input: sorted JSON, with every number encoded as big-endian f64 hex. */
export function fingerprintData(value: unknown): string {
    const encode = (v: unknown): unknown => {
        if (typeof v === 'number') {
            if (!Number.isFinite(v)) throw new Error('Non-finite fingerprint number');
            const buffer = new ArrayBuffer(8);
            new DataView(buffer).setFloat64(0, v === 0 ? 0 : v, false);
            return { $f64: Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('') };
        }
        if (Array.isArray(v)) return v.map(encode);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v)
            .filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)]));
        return v;
    };
    return canonicalJson(encode(value));
}
