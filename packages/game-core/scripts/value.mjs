// A learned position value for さいきょう, trained on match outcomes. Node only (no browser).
//   npm run cpu:value -- collect [games=40000] [share of turns kept=0.5]
//   npm run cpu:value -- train [hidden=32] [epochs=4]
//   npm run cpu:value -- adopt
//   npm run cpu:value -- label [games=40000] [share=0.5] [first seed=1000000]
//   npm run cpu:value -- label-records <reports.jsonl>
//   npm run cpu:value -- train [hidden] [epochs] <outcome|search|oracle|mix-search|mix-oracle>[+records]
// collect: つよい plays itself (with an occasional random move, so off-plan positions are covered)
//   and sampled turn starts are stored with who won, in scripts/value-data.bin (not committed).
// train: fits the network of src/ai/value.ts and writes scripts/value-model.json (not committed).
//   Positions of the same match stay together in either the training or the validation part.
// label: like collect, and every position also gets さいきょう's search judgement as a target, with
//   and without seeing the hidden cards (winProbability in src/ai/assess.ts), in
//   scripts/value-search-<first seed>.bin. It is slow: run it in parts with different first seeds;
//   training reads every part.
// label-records: the same labels for the turn starts of matches played against さいきょう, as stored by
//   the CPU server (services/cpu-server, reports/*.jsonl), in scripts/value-records.bin.
// train … <target>: which target to fit from value-search.bin; `mix-*` averages it with the outcome.
//   Without a target, the outcomes in value-data.bin are used.
// adopt: copies that model into src/ai/value-model.ts, which さいきょう uses. Do it only when
//   `createMaster({ evaluate: createValueEvaluator(model) })` clearly beats the current さいきょう
//   over a few hundred matches it was not chosen on.
// The sampling and the fitting themselves are in src/ai/value-train.ts (shared with the CPU server).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { labeledSelfPlay, selfPlayPositions, trainValue, valueData, VALUE_ROW } from '../dist/ai/value-train.js';
import { createValueEvaluator, valueFeatures, valueModel, winProbability } from '../dist/ai/index.js';
import { applyCommand, newGame, sandboxRules } from '../dist/index.js';
import { catalog } from './catalog.mjs';

const dataFile = new URL('./value-data.bin', import.meta.url), recordsFile = new URL('./value-records.bin', import.meta.url), modelFile = new URL('./value-model.json', import.meta.url);
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
/** Several data files of the same layout as one (header, match ids, outcomes, [search, oracle,] features). */
function joinParts(files, labelled) {
  if (files.length === 1) return files[0];
  const counts = files.map(f => new Uint32Array(f.buffer.slice(f.byteOffset, f.byteOffset + 8))[1]), total = counts.reduce((a, b) => a + b, 0);
  const row = new Uint32Array(files[0].buffer.slice(files[0].byteOffset, files[0].byteOffset + 4))[0];
  const sections = [4, 1, ...(labelled ? [4, 4] : []), row * 4];
  const out = [Buffer.from(new Uint32Array([row, total]).buffer)];
  let offsets = files.map(() => 8);
  for (const size of sections) files.forEach((f, i) => {
    out.push(f.subarray(offsets[i], offsets[i] + counts[i] * size));
    offsets[i] += counts[i] * size;
  });
  return Buffer.concat(out);
}

if (!isMainThread) {
  const evaluate = createValueEvaluator(valueModel);
  parentPort.on('message', ({ seeds, share, label }) => {
    if (label) {
      const games = seeds.flatMap(seed => { const g = labeledSelfPlay(catalog, seed, share, evaluate, valueModel.scale); return g ? [{ id: seed, ...g }] : []; });
      const { x, y, match } = valueData(games);
      const search = new Float32Array(games.flatMap(g => g.search)), oracle = new Float32Array(games.flatMap(g => g.oracle));
      return parentPort.postMessage({ x, y, match, search, oracle }, [x.buffer, y.buffer, match.buffer, search.buffer, oracle.buffer]);
    }
    const { x, y, match } = valueData(seeds.flatMap(seed => {
      const sample = selfPlayPositions(catalog, seed, share);
      return sample ? [{ id: seed, ...sample }] : [];
    }));
    parentPort.postMessage({ x, y, match }, [x.buffer, y.buffer, match.buffer]);
  });
} else if (process.argv[2] === 'collect' || process.argv[2] === 'label') {
  const label = process.argv[2] === 'label';
  const [games = 40000, share = 0.5, first = 1_000_000] = process.argv.slice(3).map(Number);
  const started = Date.now(), workers = Array.from({ length: Math.max(1, os.cpus().length - 1) }, () => new Worker(new URL(import.meta.url)));
  // Seeds from 1e6: apart from the matches used to compare levels (arena) and to train weights.
  const seeds = Array.from({ length: games }, (_, i) => first + i), chunk = 100;
  const parts = [];
  await Promise.all(workers.map(worker => new Promise(done => {
    const next = () => seeds.length ? worker.postMessage({ seeds: seeds.splice(0, label ? 20 : chunk), share, label }) : done(worker.terminate());
    worker.on('message', part => { parts.push(part); next(); });
    next();
  })));
  const count = parts.reduce((sum, part) => sum + part.y.length, 0);
  const labels = label ? [...parts.map(p => p.search), ...parts.map(p => p.oracle)] : [];
  writeFileSync(label ? new URL(`./value-search-${first}.bin`, import.meta.url) : dataFile, Buffer.concat([new Uint32Array([VALUE_ROW, count]), ...parts.map(p => p.match), ...parts.map(p => p.y), ...labels, ...parts.map(p => p.x)].map(bytes)));
  const wins = parts.reduce((sum, part) => sum + part.y.reduce((a, b) => a + b, 0), 0);
  console.log(`${count} positions from ${games} matches (side 0 won ${(wins / count * 100).toFixed(1)}%), ${Math.round((Date.now() - started) / 1000)}s`);
} else if (process.argv[2] === 'label-records') {
  // Turn starts of each recorded match, replayed with the engine. Records that no longer replay are skipped.
  const evaluate = createValueEvaluator(valueModel), rows = [], won = [], match = [], search = [], oracle = [];
  const records = readFileSync(process.argv[3], 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  for (const [n, record] of records.entries()) {
    let state;
    try { state = newGame(record.decks.map((d, i) => ({ ...d, name: String(i) })), catalog, sandboxRules, record.seed); } catch { continue; }
    const kept = [];
    let turn = -1, ok = true;
    for (const command of record.commands) {
      if (state.phase === 'playing' && state.turn !== turn) { turn = state.turn; kept.push(state); }
      const result = applyCommand(state, command, catalog);
      if (result.error) { ok = false; break; }
      state = result.state;
    }
    if (!ok || state.winner !== record.winner) continue;
    for (const [i, position] of kept.entries()) {
      rows.push(valueFeatures(position, catalog));
      won.push(record.winner === 0 ? 1 : 0);
      match.push(3_000_000_000 + n);
      search.push(winProbability(position, catalog, evaluate, valueModel.scale, { seed: n * 31 + i }));
      oracle.push(winProbability(position, catalog, evaluate, valueModel.scale, { oracle: true }));
    }
  }
  const x = new Float32Array(rows.length * VALUE_ROW);
  rows.forEach((row, i) => x.set(row, i * VALUE_ROW));
  writeFileSync(recordsFile, Buffer.concat([new Uint32Array([VALUE_ROW, rows.length]), new Uint32Array(match), new Uint8Array(won), new Float32Array(search), new Float32Array(oracle), x].map(bytes)));
  console.log(`${rows.length} positions from ${records.length} recorded matches → scripts/value-records.bin`);
} else if (process.argv[2] === 'train') {
  const [hidden = 32, epochs = 4] = process.argv.slice(3, 5).map(Number), [target = 'outcome', extra] = (process.argv[5] ?? 'outcome').split('+');
  const parts = target === 'outcome' ? [dataFile] : readdirSync(new URL('.', import.meta.url)).filter(name => /^value-search-\d+\.bin$/.test(name)).map(name => new URL(`./${name}`, import.meta.url));
  if (!parts.length || !existsSync(parts[0])) throw new Error(`no data: run \`${target === 'outcome' ? 'collect' : 'label'}\` first`);
  const file = joinParts(parts.map(part => readFileSync(part)), target !== 'outcome'), [row, count] = new Uint32Array(file.buffer, file.byteOffset, 2);
  if (row !== VALUE_ROW) throw new Error('the data was collected with other features: collect it again');
  const copy = (Type, offset, length) => new Type(file.buffer.slice(file.byteOffset + offset, file.byteOffset + offset + length * Type.BYTES_PER_ELEMENT));
  const labelled = target !== 'outcome', xAt = 8 + count * 5 + (labelled ? count * 8 : 0);
  const data = { match: copy(Uint32Array, 8, count), y: copy(Uint8Array, 8 + count * 4, count), x: copy(Float32Array, xAt, count * VALUE_ROW) };
  if (labelled && target !== 'outcome') {
    const search = copy(Float32Array, 8 + count * 5, count), oracle = copy(Float32Array, 8 + count * 9, count);
    const judged = target.endsWith('oracle') ? oracle : search, mix = target.startsWith('mix') ? 0.5 : 0;
    data.y = judged.map((p, i) => mix * data.y[i] + (1 - mix) * p);
  }
  if (extra === 'records') {
    // Recorded matches against people, labelled the same way, counted three times.
    const r = readFileSync(recordsFile), [, n] = new Uint32Array(r.buffer, r.byteOffset, 2);
    const take = (Type, offset, length) => new Type(r.buffer.slice(r.byteOffset + offset, r.byteOffset + offset + length * Type.BYTES_PER_ELEMENT));
    const won = take(Uint8Array, 8 + n * 4, n), judged = take(Float32Array, 8 + n * (target.endsWith('oracle') ? 9 : 5), n), mix = target.startsWith('mix') ? 0.5 : 0;
    const y = target === 'outcome' ? Float32Array.from(won) : judged.map((p, i) => mix * won[i] + (1 - mix) * p);
    const join = (a, b) => { const out = new (a.constructor === Uint8Array ? Float32Array : a.constructor)(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
    data.x = join(data.x, take(Float32Array, 8 + n * 13, n * VALUE_ROW));
    data.y = join(Float32Array.from(data.y), y);
    data.match = join(data.match, take(Uint32Array, 8, n));
    data.weight = new Float32Array(data.y.length).fill(1).fill(3, data.y.length - n);
  }
  const show = (name, fit) => console.log(`${name.padEnd(18)}  loss ${fit.loss.toFixed(4)}  accuracy ${(fit.accuracy * 100).toFixed(1)}%`);
  const result = trainValue(data, { hidden, epochs, onEpoch: (epoch, fit) => show(`epoch ${epoch}`, fit) });
  show('hand-written value', result.baseline);
  writeFileSync(modelFile, JSON.stringify(result.model) + '\n');
  console.log(`\n${result.training} training / ${result.validation} validation positions`);
  console.log(`best validation loss ${result.fit.loss.toFixed(4)} (accuracy ${(result.fit.accuracy * 100).toFixed(1)}%), scale ${result.model.scale} → scripts/value-model.json`);
} else if (process.argv[2] === 'adopt') {
  const model = readFileSync(modelFile, 'utf8').trim();
  writeFileSync(new URL('../src/ai/value-model.ts', import.meta.url), `// Generated by \`npm run cpu:value -- adopt\`. Do not edit: retrain instead (scripts/value.mjs).
import type { ValueModel } from './value.ts';

export const valueModel: ValueModel = ${model};
`);
  console.log('src/ai/value-model.ts updated');
} else console.log('usage: npm run cpu:value -- collect [games] [share of turns] | train [hidden] [epochs] | adopt');
