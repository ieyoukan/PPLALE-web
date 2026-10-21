// The value of single moves (src/ai/policy.ts), learned from self-play outcomes. Node only.
//   pnpm run cpu:policy -- [games=20000] [share of decisions=0.2] [hidden=48] [epochs=4]
// つよい plays itself with a random move now and then (as for the position value); for a share of
// the decisions the move played is stored with whether its player won. Positions of one match stay
// together in the training or the validation part. Writes scripts/policy-model.json (not committed).
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { applyCommand, createHard, defaultWeights, playMatch } from '../dist/index.js';
import { policyCards, policyInputs, policyLayout } from '../dist/ai/policy.js';
import { valueFeatures } from '../dist/ai/value.js';
import { catalog } from './catalog.mjs';

const EXPLORE = 0.25;
const cards = policyCards(catalog), index = new Map(cards.map((id, i) => [id, i])), INPUTS = policyLayout(cards).inputs;

if (!isMainThread) {
  parentPort.on('message', ({ seeds, share }) => {
    const idx = [], val = [], ends = [], won = [], match = [];
    for (const seed of seeds) {
      const hard = createHard(defaultWeights);
      const explorer = { ...hard, choose: d => d.state.phase === 'playing' && d.random(1000) < EXPLORE * 1000 ? d.moves[d.random(d.moves.length)] : hard.choose(d) };
      let r = Math.imul(seed, 2654435761) >>> 0;
      const chance = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
      const kept = [];
      const result = playMatch(catalog, { levels: [explorer, explorer], seed, onStep(state, command, side) {
        if (state.phase !== 'playing' || state.active !== side || chance() >= share) return;
        const next = applyCommand(state, command, catalog);
        if (next.error) return;
        const x = policyInputs(state, { command, next: next.state }, valueFeatures(state, catalog), catalog, cards, index);
        kept.push({ x, side });
      } });
      if (typeof result.winner !== 'number') continue;
      for (const { x, side } of kept) {
        for (let i = 0; i < x.length; i++) if (x[i]) { idx.push(i); val.push(x[i]); }
        ends.push(idx.length); won.push(result.winner === side ? 1 : 0); match.push(seed);
      }
    }
    const out = { idx: Uint16Array.from(idx), val: Float32Array.from(val), ends: Uint32Array.from(ends), won: Uint8Array.from(won), match: Uint32Array.from(match) };
    parentPort.postMessage(out, Object.values(out).map(a => a.buffer));
  });
} else {
  const [games = 20000, share = 0.2, hidden = 48, epochs = 4] = process.argv.slice(2).map(Number);
  const started = Date.now(), workers = Array.from({ length: Math.max(1, os.cpus().length - 1) }, () => new Worker(new URL(import.meta.url)));
  const seeds = Array.from({ length: games }, (_, i) => 4_000_000 + i), parts = [];
  await Promise.all(workers.map(worker => new Promise(done => {
    const next = () => seeds.length ? worker.postMessage({ seeds: seeds.splice(0, 50), share }) : done(worker.terminate());
    worker.on('message', part => { parts.push(part); next(); });
    next();
  })));
  // One list of samples: inputs [from, to) of idx / val.
  const samples = [];
  for (const p of parts) { let from = 0; p.ends.forEach((to, i) => { samples.push({ idx: p.idx.subarray(from, to), val: p.val.subarray(from, to), y: p.won[i], match: p.match[i] }); from = to; }); }
  console.log(`${samples.length} decisions from ${games} matches, ${Math.round((Date.now() - started) / 1000)}s; ${INPUTS} inputs`);

  let random = 20261019;
  const uniform = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return (random + 0.5) / 4294967296; };
  const gaussian = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
  const H = hidden, B = INPUTS * H, V = B + H, L = V + H, O = L + INPUTS, SIZE = O + 1;
  const w = new Float64Array(SIZE);
  for (let i = 0; i < B; i++) w[i] = gaussian() * 0.05;
  for (let j = 0; j < H; j++) w[V + j] = gaussian() * 0.1;
  const grad = new Float64Array(SIZE), m1 = new Float64Array(SIZE), m2 = new Float64Array(SIZE), h = new Float64Array(H);
  const forward = s => {
    for (let j = 0; j < H; j++) h[j] = w[B + j];
    let z = w[O];
    for (let k = 0; k < s.idx.length; k++) { const i = s.idx[k], v = s.val[k]; z += v * w[L + i]; for (let j = 0, at = i * H; j < H; j++) h[j] += v * w[at + j]; }
    for (let j = 0; j < H; j++) { h[j] = Math.tanh(h[j]); z += w[V + j] * h[j]; }
    return z;
  };
  const training = samples.filter(s => s.match % 10 !== 0), validation = samples.filter(s => s.match % 10 === 0);
  const loss = z => Math.log1p(Math.exp(-Math.abs(z))) + Math.max(z, 0);
  const fit = () => { let t = 0, c = 0; for (const s of validation) { const z = forward(s); t += loss(z) - s.y * z; c += (z > 0) === (s.y === 1); } return [t / validation.length, c / validation.length]; };
  const base = validation.reduce((a, s) => a + s.y, 0) / validation.length;
  console.log(`validation ${validation.length}; always guessing the average: loss ${(-(base * Math.log(base) + (1 - base) * Math.log(1 - base))).toFixed(4)}`);
  let step = 0, best = { loss: Infinity };
  for (let epoch = 1; epoch <= epochs; epoch++) {
    for (let i = training.length - 1; i > 0; i--) { const j = Math.floor(uniform() * (i + 1)); [training[i], training[j]] = [training[j], training[i]]; }
    const rate = 2e-3 * 0.5 * (1 + Math.cos(Math.PI * (epoch - 1) / epochs));
    for (let start = 0; start < training.length; start += 256) {
      grad.fill(0);
      const end = Math.min(training.length, start + 256);
      for (let n = start; n < end; n++) {
        const s = training[n], d = (1 / (1 + Math.exp(-forward(s))) - s.y) / (end - start);
        grad[O] += d;
        for (let j = 0; j < H; j++) { grad[V + j] += d * h[j]; h[j] = d * w[V + j] * (1 - h[j] * h[j]); grad[B + j] += h[j]; }
        for (let k = 0; k < s.idx.length; k++) { const i = s.idx[k], v = s.val[k]; grad[L + i] += d * v; for (let j = 0, at = i * H; j < H; j++) grad[at + j] += h[j] * v; }
      }
      step++;
      const fix = Math.sqrt(1 - 0.999 ** step) / (1 - 0.9 ** step);
      for (let p = 0; p < SIZE; p++) { const g = grad[p] + 1e-5 * w[p]; m1[p] = 0.9 * m1[p] + 0.1 * g; m2[p] = 0.999 * m2[p] + 0.001 * g * g; w[p] -= rate * fix * m1[p] / (Math.sqrt(m2[p]) + 1e-8); }
    }
    const [l, a] = fit();
    console.log(`epoch ${epoch}  loss ${l.toFixed(4)}  accuracy ${(a * 100).toFixed(1)}%`);
    if (l < best.loss) best = { loss: l, w: Float64Array.from(w) };
  }
  const r4 = a => Array.from(a, v => Math.round(v * 1e4) / 1e4);
  const model = { cards, inputs: INPUTS, hidden: H, first: r4(best.w.subarray(0, B)), bias: r4(best.w.subarray(B, V)), out: r4(best.w.subarray(V, L)), linear: r4(best.w.subarray(L, O)), outBias: Math.round(best.w[O] * 1e4) / 1e4 };
  writeFileSync(new URL('./policy-model.json', import.meta.url), JSON.stringify(model) + '\n');
  console.log(`→ scripts/policy-model.json (validation loss ${best.loss.toFixed(4)})`);
}
