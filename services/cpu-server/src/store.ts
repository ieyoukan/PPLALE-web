// Everything the server keeps, as files under one directory (a volume in the cluster):
//   reports/<day>.jsonl   one verified match record per line
//   models/<version>.json published models; current.json names the one in use
//   training.json         what the training runs did
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseValueModel, valueModel } from '@pplale/game-core/ai';
import type { ValueModel } from '@pplale/game-core';
import type { MatchRecord } from './report.ts';

export interface PublishedModel { version: string; model: ValueModel }
export interface TrainingRun {
    at: string;
    reports: number;
    /** Positions from recorded matches / from self-play. */
    positions: [number, number];
    loss: number;
    /** The candidate's result against the built-in model. */
    gate: { wins: number; matches: number };
    version: string;
    published: boolean;
}
export interface TrainingLog {
    /** Records that existed at the last run; training waits for enough new ones. */
    trainedReports: number;
    runs: TrainingRun[];
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 8);
/** The model compiled into this image: the fallback, and what every candidate has to match. */
export const builtIn: PublishedModel = { version: `built-in-${hash(valueModel)}`, model: valueModel };

const readJson = (file: string): unknown => {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
};
/** Replaces the file in one step, so a reader never sees half of it. */
function writeJson(file: string, value: unknown) {
    writeFileSync(`${file}.tmp`, JSON.stringify(value));
    renameSync(`${file}.tmp`, file);
}

export function openStore(directory: string) {
    const reports = path.join(directory, 'reports'), models = path.join(directory, 'models');
    for (const dir of [reports, models]) mkdirSync(dir, { recursive: true });
    const trainingFile = path.join(directory, 'training.json'), currentFile = path.join(directory, 'current.json');

    /** Every stored record. A line cut off by a crash or still being written is skipped. */
    function readReports(): MatchRecord[] {
        return readdirSync(reports).filter(name => name.endsWith('.jsonl')).sort().flatMap(name =>
            readFileSync(path.join(reports, name), 'utf8').split('\n').flatMap(line => {
                try { return line ? [JSON.parse(line) as MatchRecord] : []; } catch { return []; }
            }));
    }
    const known = new Map(readReports().map(record => [record.id, { model: record.model, winner: record.winner }]));

    return {
        directory,
        ensure: (dir: string) => { mkdirSync(dir, { recursive: true }); },
        readReports,
        reportCount: () => known.size,
        /** False when the same match was already stored. */
        addReport(record: MatchRecord): boolean {
            if (known.has(record.id)) return false;
            appendFileSync(path.join(reports, `${record.day}.jsonl`), `${JSON.stringify(record)}\n`);
            known.set(record.id, { model: record.model, winner: record.winner });
            return true;
        },
        /** Matches and CPU wins per model version: how the CPU really does against people. */
        results() {
            const byModel: Record<string, { matches: number; cpuWins: number }> = {};
            for (const { model, winner } of known.values()) {
                const entry = byModel[model] ??= { matches: 0, cpuWins: 0 };
                entry.matches++;
                if (winner === 1) entry.cpuWins++;
            }
            return byModel;
        },
        /** The published model, or the built-in one when none was published or it no longer fits this build. */
        currentModel(): PublishedModel {
            const current = readJson(currentFile) as { version?: unknown } | null;
            if (typeof current?.version !== 'string' || !/^[\w.-]+$/.test(current.version)) return builtIn;
            const model = parseValueModel(readJson(path.join(models, `${current.version}.json`)));
            return model ? { version: current.version, model } : builtIn;
        },
        publish(model: ValueModel): PublishedModel {
            const version = `learned-${hash(model)}`;
            writeJson(path.join(models, `${version}.json`), model);
            writeJson(currentFile, { version });
            return { version, model };
        },
        training(): TrainingLog {
            const log = readJson(trainingFile) as Partial<TrainingLog> | null;
            return { trainedReports: typeof log?.trainedReports === 'number' ? log.trainedReports : 0, runs: Array.isArray(log?.runs) ? log.runs : [] };
        },
        saveTraining(log: TrainingLog) { writeJson(trainingFile, { ...log, runs: log.runs.slice(-50) }); },
    };
}
export type Store = ReturnType<typeof openStore>;
