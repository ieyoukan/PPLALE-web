// One training run. Started by the server when enough new matches arrived (see trainer.ts), or by
// hand with `npm run train`. It only ever publishes a model that holds its own against the
// built-in one, so a bad batch of records cannot make さいきょう weaker.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trainValue, valueData, VALUE_ROW } from '@pplale/game-core/train';
import type { ValueData } from '@pplale/game-core/train';
import { catalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { runTasks } from './pool.ts';
import { recordPositions } from './report.ts';
import { openStore } from './store.ts';
import type { Store, TrainingRun } from './store.ts';

/** Self-play seeds from 1e6 and comparison seeds from 5e6: apart from each other and from `cpu:arena`. */
const SELF_PLAY_SEED = 1_000_000, GATE_SEED = 5_000_000;
/** Ids of recorded matches, above every self-play seed. */
const RECORD_ID = 3_000_000_000;
const SHARE = 0.5, CHUNK = 100;

const bytes = (array: Uint32Array | Uint8Array | Float32Array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

/** つよい self-play positions. Collected once per image version and kept on the volume. */
async function selfPlay(store: Store, { version, training }: Config): Promise<ValueData> {
    const directory = path.join(store.directory, 'selfplay'), name = `${version}-${VALUE_ROW}-${training.selfPlayGames}.bin`;
    const file = path.join(directory, name);
    if (existsSync(file)) {
        const data = readFileSync(file), count = new Uint32Array(data.buffer, data.byteOffset, 1)[0];
        const copy = <T>(Type: { new(buffer: ArrayBuffer): T; BYTES_PER_ELEMENT: number }, offset: number, length: number) =>
            new Type(data.buffer.slice(data.byteOffset + offset, data.byteOffset + offset + length * Type.BYTES_PER_ELEMENT) as ArrayBuffer);
        return { match: copy(Uint32Array, 4, count), y: copy(Uint8Array, 4 + count * 4, count), x: copy(Float32Array, 4 + count * 5, count * VALUE_ROW) };
    }
    const seeds = Array.from({ length: training.selfPlayGames }, (_, i) => SELF_PLAY_SEED + i);
    const tasks = Array.from({ length: Math.ceil(seeds.length / CHUNK) }, (_, i) => ({ kind: 'selfplay' as const, seeds: seeds.slice(i * CHUNK, (i + 1) * CHUNK), share: SHARE }));
    const parts = await runTasks(tasks, training.threads);
    const count = parts.reduce((sum, part) => sum + part.y.length, 0);
    const join = <T extends Uint32Array | Uint8Array | Float32Array>(out: T, pick: (part: typeof parts[number]) => T) => {
        let at = 0;
        for (const part of parts) { out.set(pick(part), at); at += pick(part).length; }
        return out;
    };
    const data = { match: join(new Uint32Array(count), p => p.match), y: join(new Uint8Array(count), p => p.y), x: join(new Float32Array(count * VALUE_ROW), p => p.x) };
    // Older versions' data is of no use any more.
    rmSync(directory, { recursive: true, force: true });
    store.ensure(directory);
    writeFileSync(file, Buffer.concat([new Uint32Array([count]), data.match, data.y, data.x].map(bytes)));
    return data;
}

export async function train(store: Store, config: Config, log: (line: string) => void = console.log): Promise<TrainingRun> {
    const { training } = config, records = store.readReports();
    const recorded = valueData(records.flatMap((record, index) => {
        const positions = recordPositions(record, catalog);
        return positions ? [{ id: RECORD_ID + index, weight: training.humanWeight, ...positions }] : [];
    }));
    log(`${records.length} recorded matches → ${recorded.y.length} positions`);
    const self = await selfPlay(store, config);
    log(`${self.y.length} self-play positions`);

    const count = self.y.length + recorded.y.length;
    const data = { x: new Float32Array(count * VALUE_ROW), y: new Uint8Array(count), match: new Uint32Array(count), weight: new Float32Array(count).fill(1) };
    data.x.set(self.x); data.y.set(self.y); data.match.set(self.match);
    data.x.set(recorded.x, self.x.length); data.y.set(recorded.y, self.y.length); data.match.set(recorded.match, self.y.length);
    data.weight.set(recorded.weight!, self.y.length);
    const result = trainValue(data);
    log(`trained: validation loss ${result.fit.loss.toFixed(4)} (hand-written value ${result.baseline.loss.toFixed(4)})`);

    const seeds = Array.from({ length: training.gatePairs }, (_, i) => GATE_SEED + i);
    const answers = await runTasks(seeds.map(seed => ({ kind: 'gate' as const, seeds: [seed], candidate: result.model })), training.threads);
    const gate = answers.reduce((sum, answer) => ({ wins: sum.wins + answer.wins, matches: sum.matches + answer.matches }), { wins: 0, matches: 0 });
    const published = gate.wins / gate.matches >= training.gateMinRate;
    const version = published ? store.publish(result.model).version : store.currentModel().version;
    log(`against the built-in model: ${gate.wins}/${gate.matches} (${(gate.wins / gate.matches * 100).toFixed(1)}%) → ${published ? `published as ${version}` : 'not published'}`);

    const run: TrainingRun = { at: new Date().toISOString(), reports: records.length, positions: [recorded.y.length, self.y.length], loss: result.fit.loss, gate, version, published };
    const history = store.training();
    store.saveTraining({ trainedReports: records.length, runs: [...history.runs, run] });
    return run;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const config = loadConfig();
    await train(openStore(config.dataDir), config);
}
