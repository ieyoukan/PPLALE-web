// A learned position value for さいきょう, trained on match outcomes. Node only (no browser).
//   npm run cpu:value -- collect [games=40000] [share of turns kept=0.5]
//   npm run cpu:value -- train [hidden=32] [epochs=4]
//   npm run cpu:value -- adopt
// collect: つよい plays itself (with an occasional random move, so off-plan positions are covered)
//   and sampled turn starts are stored with who won, in scripts/value-data.bin (not committed).
// train: fits the network of src/ai/value.ts and writes scripts/value-model.json (not committed).
//   Positions of the same match stay together in either the training or the validation part.
// adopt: copies that model into src/ai/value-model.ts, which さいきょう uses. Do it only when
//   `createMaster({ evaluate: createValueEvaluator(model) })` clearly beats the current さいきょう
//   over a few hundred matches it was not chosen on.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { createHard, defaultWeights, playMatch, valueFeatures, valueLayout, valueLogit } from '../dist/index.js';
import { catalog } from './catalog.mjs';

const { full: FULL, inputs: INPUTS } = valueLayout;
const ROW = FULL * 2;
const dataFile = new URL('./value-data.bin', import.meta.url), modelFile = new URL('./value-model.json', import.meta.url);
/**
 * A random move this often. The outcome after a bad move is what teaches the network which
 * moves matter: 0.25 gave a clearly stronger さいきょう than 0.08.
 */
const EXPLORE = 0.25;

/** Sampled positions of one self-play match: features (both sides) and whether side 0 won. */
function sample(seed, share) {
  const hard = createHard(defaultWeights);
  const explorer = { ...hard, choose: d => d.state.phase === 'playing' && d.random(1000) < EXPLORE * 1000 ? d.moves[d.random(d.moves.length)] : hard.choose(d) };
  let r = (seed * 2654435761) >>> 0;
  const chance = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  const rows = [];
  let turn = -1;
  // Only the start of a turn: that is where the search asks for a value (a finished turn).
  const result = playMatch(catalog, { levels: [explorer, explorer], seed, onStep(state) {
    if (state.phase !== 'playing' || state.turn === turn) return;
    turn = state.turn;
    if (chance() < share) rows.push(valueFeatures(state, catalog));
  } });
  return typeof result.winner === 'number' ? { rows, won: result.winner === 0 ? 1 : 0 } : { rows: [], won: 0 };
}

if (!isMainThread) {
  parentPort.on('message', ({ seeds, share }) => {
    const games = seeds.map(seed => ({ seed, ...sample(seed, share) }));
    const count = games.reduce((sum, game) => sum + game.rows.length, 0);
    const x = new Float32Array(count * ROW), y = new Uint8Array(count), match = new Uint32Array(count);
    let at = 0;
    for (const game of games) for (const row of game.rows) { x.set(row, at * ROW); y[at] = game.won; match[at++] = game.seed; }
    parentPort.postMessage({ x, y, match }, [x.buffer, y.buffer, match.buffer]);
  });
} else if (process.argv[2] === 'collect') {
  const [games = 40000, share = 0.5] = process.argv.slice(3).map(Number);
  const started = Date.now(), workers = Array.from({ length: Math.max(1, os.cpus().length - 1) }, () => new Worker(new URL(import.meta.url)));
  // Seeds from 1e6: apart from the matches used to compare levels (arena) and to train weights.
  const seeds = Array.from({ length: games }, (_, i) => 1_000_000 + i), chunk = 100;
  const parts = [];
  await Promise.all(workers.map(worker => new Promise(done => {
    const next = () => seeds.length ? worker.postMessage({ seeds: seeds.splice(0, chunk), share }) : done(worker.terminate());
    worker.on('message', part => { parts.push(part); next(); });
    next();
  })));
  const count = parts.reduce((sum, part) => sum + part.y.length, 0);
  const header = new Uint32Array([FULL, count]);
  writeFileSync(dataFile, Buffer.concat([header, ...parts.map(p => p.match), ...parts.map(p => p.y), ...parts.map(p => p.x)].map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));
  const wins = parts.reduce((sum, part) => sum + part.y.reduce((a, b) => a + b, 0), 0);
  console.log(`${count} positions from ${games} matches (side 0 won ${(wins / count * 100).toFixed(1)}%), ${Math.round((Date.now() - started) / 1000)}s`);
} else if (process.argv[2] === 'train') {
  if (!existsSync(dataFile)) throw new Error('no data: run `collect` first');
  const [hidden = 32, epochs = 4] = process.argv.slice(3).map(Number);
  const file = readFileSync(dataFile), [full, count] = new Uint32Array(file.buffer, file.byteOffset, 2);
  if (full !== FULL) throw new Error('the data was collected with other features: run `collect` again');
  const copy = (Type, offset, length) => new Type(file.buffer.slice(file.byteOffset + offset, file.byteOffset + offset + length * Type.BYTES_PER_ELEMENT));
  const match = copy(Uint32Array, 8, count), y = copy(Uint8Array, 8 + count * 4, count), x = copy(Float32Array, 8 + count * 5, count * ROW);
  const all = Array.from({ length: count }, (_, i) => i);
  const validation = all.filter(i => match[i] % 10 === 0), training = all.filter(i => match[i] % 10 !== 0);

  let random = 20261005;
  const uniform = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return (random + 0.5) / 4294967296; };
  const gaussian = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
  // One flat parameter vector: first layer, hidden bias, output weights, direct weights.
  const B = INPUTS * hidden, V = B + hidden, L = V + hidden, SIZE = L + INPUTS;
  const w = new Float64Array(SIZE);
  for (let i = 0; i < B; i++) w[i] = gaussian() * 0.1;
  for (let j = 0; j < hidden; j++) w[V + j] = gaussian() * 0.1;
  const model = () => ({ inputs: INPUTS, hidden, first: [...w.subarray(0, B)], bias: [...w.subarray(B, V)], out: [...w.subarray(V, L)], linear: [...w.subarray(L)], scale: 1 });

  const grad = new Float64Array(SIZE), m1 = new Float64Array(SIZE), m2 = new Float64Array(SIZE);
  const act = [new Float64Array(hidden), new Float64Array(hidden)];
  const row = new Float32Array(ROW);
  /** Network output for one side of position `at`; `own` / `foe` are offsets into the row. */
  const forward = (own, foe, h) => {
    for (let j = 0; j < hidden; j++) h[j] = w[B + j];
    let sum = 0;
    for (let i = 0; i < INPUTS; i++) {
      const value = i < FULL ? row[own + i] : row[foe + i - FULL];
      if (!value) continue;
      sum += value * w[L + i];
      for (let j = 0, at = i * hidden; j < hidden; j++) h[j] += value * w[at + j];
    }
    for (let j = 0; j < hidden; j++) { h[j] = Math.tanh(h[j]); sum += w[V + j] * h[j]; }
    return sum;
  };
  const backward = (own, foe, h, delta) => {
    for (let j = 0; j < hidden; j++) { grad[V + j] += delta * h[j]; h[j] = delta * w[V + j] * (1 - h[j] * h[j]); grad[B + j] += h[j]; }
    for (let i = 0; i < INPUTS; i++) {
      const value = i < FULL ? row[own + i] : row[foe + i - FULL];
      if (!value) continue;
      grad[L + i] += delta * value;
      for (let j = 0, at = i * hidden; j < hidden; j++) grad[at + j] += h[j] * value;
    }
  };
  const logit = i => { row.set(x.subarray(i * ROW, (i + 1) * ROW)); return forward(0, FULL, act[0]) - forward(FULL, 0, act[1]); };
  const loss = z => Math.log1p(Math.exp(-Math.abs(z))) + Math.max(z, 0);
  const score = () => {
    let total = 0, correct = 0;
    for (const i of validation) { const z = logit(i); total += loss(z) - y[i] * z; correct += (z > 0) === (y[i] === 1); }
    return { loss: total / validation.length, accuracy: correct / validation.length };
  };

  // What the hand-written evaluation alone predicts: the bar the network has to clear.
  const plan = i => x[i * ROW + FULL - 1];
  let k = 1;
  for (let step = 0; step < 50; step++) {
    let g = 0, hh = 0;
    for (const i of training) { const p = 1 / (1 + Math.exp(-k * plan(i))); g += (p - y[i]) * plan(i); hh += p * (1 - p) * plan(i) ** 2; }
    k -= g / (hh || 1);
  }
  const baseline = validation.reduce((acc, i) => {
    const z = k * plan(i);
    return { loss: acc.loss + (loss(z) - y[i] * z) / validation.length, accuracy: acc.accuracy + ((z > 0) === (y[i] === 1)) / validation.length };
  }, { loss: 0, accuracy: 0 });
  console.log(`${training.length} training / ${validation.length} validation positions, ${INPUTS} inputs × ${hidden} hidden`);
  console.log(`coin flip           loss 0.6931  accuracy 50.0%`);
  console.log(`hand-written value  loss ${baseline.loss.toFixed(4)}  accuracy ${(baseline.accuracy * 100).toFixed(1)}%`);

  const BATCH = 128, DECAY = 1e-5;
  let best = { loss: Infinity }, step = 0;
  for (let epoch = 1; epoch <= epochs; epoch++) {
    for (let i = training.length - 1; i > 0; i--) { const j = Math.floor(uniform() * (i + 1)); [training[i], training[j]] = [training[j], training[i]]; }
    const rate = 2e-3 * 0.5 * (1 + Math.cos(Math.PI * (epoch - 1) / epochs));
    for (let start = 0; start < training.length; start += BATCH) {
      grad.fill(0);
      const end = Math.min(training.length, start + BATCH);
      for (let n = start; n < end; n++) {
        const i = training[n], delta = (1 / (1 + Math.exp(-logit(i))) - y[i]) / (end - start);
        backward(0, FULL, act[0], delta);
        backward(FULL, 0, act[1], -delta);
      }
      step++;
      const fix = Math.sqrt(1 - 0.999 ** step) / (1 - 0.9 ** step);
      for (let p = 0; p < SIZE; p++) {
        const g = grad[p] + DECAY * w[p];
        m1[p] = 0.9 * m1[p] + 0.1 * g;
        m2[p] = 0.999 * m2[p] + 0.001 * g * g;
        w[p] -= rate * fix * m1[p] / (Math.sqrt(m2[p]) + 1e-8);
      }
    }
    const result = score();
    console.log(`epoch ${String(epoch).padStart(2)}           loss ${result.loss.toFixed(4)}  accuracy ${(result.accuracy * 100).toFixed(1)}%`);
    if (result.loss < best.loss) best = { ...result, model: model() };
  }
  // The search's thresholds assume the scale of the hand-written value: match its spread.
  const spread = values => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length); };
  const features = i => x.subarray(i * ROW, (i + 1) * ROW);
  best.model.scale = spread(validation.map(i => plan(i) * 100)) / spread(validation.map(i => valueLogit(best.model, features(i))));
  const round = values => values.map(value => Math.round(value * 1e4) / 1e4);
  for (const key of ['first', 'bias', 'out', 'linear']) best.model[key] = round(best.model[key]);
  best.model.scale = Math.round(best.model.scale * 100) / 100;
  writeFileSync(modelFile, JSON.stringify(best.model) + '\n');
  console.log(`\nbest validation loss ${best.loss.toFixed(4)} (accuracy ${(best.accuracy * 100).toFixed(1)}%), scale ${best.model.scale} → scripts/value-model.json`);
} else if (process.argv[2] === 'adopt') {
  const model = readFileSync(modelFile, 'utf8').trim();
  writeFileSync(new URL('../src/ai/value-model.ts', import.meta.url), `// Generated by \`npm run cpu:value -- adopt\`. Do not edit: retrain instead (scripts/value.mjs).
import type { ValueModel } from './value.ts';

export const valueModel: ValueModel = ${model};
`);
  console.log('src/ai/value-model.ts updated');
} else console.log('usage: npm run cpu:value -- collect [games] [share of turns] | train [hidden] [epochs] | adopt');
