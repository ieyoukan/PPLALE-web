// Trains the evaluation weights of つよい / さいきょう by self-play, in Node only (no browser).
//   npm run cpu:train -- [generations=30] [candidates=8] [pairs=100]
// Each generation mutates the best weights, plays every candidate against the best (the same decks
// and seed twice with seats swapped, so luck cancels), re-checks the winner on fresh matches and
// keeps it only if it still clearly wins. The result is written to scripts/weights.json (not
// committed); copy it into `defaultWeights` (src/ai/evaluate.ts) only when the final check against
// the starting weights is well above 50% (one standard error is about 1.1% over 2000 matches).
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { createHard, defaultWeights, playMatch } from '../dist/index.js';
import { catalog } from './catalog.mjs';

/** Candidate's wins over `seeds`, two matches per seed (one in each seat). */
function duel(candidate, base, seeds) {
  const a = createHard(candidate), b = createHard(base);
  let wins = 0;
  for (const seed of seeds) {
    if (playMatch(catalog, { levels: [a, b], seed }).winner === 0) wins++;
    if (playMatch(catalog, { levels: [b, a], seed }).winner === 1) wins++;
  }
  return wins;
}

if (!isMainThread) {
  parentPort.on('message', ({ id, candidate, base, seeds }) => parentPort.postMessage({ id, wins: duel(candidate, base, seeds) }));
} else {
  const [generations = 30, candidates = 8, pairs = 100] = process.argv.slice(2).map(Number);
  const workers = Array.from({ length: Math.max(1, os.cpus().length - 1) }, () => new Worker(new URL(import.meta.url)));
  const waiting = new Map();
  let nextId = 0, nextWorker = 0;
  for (const worker of workers) worker.on('message', ({ id, wins }) => { waiting.get(id)(wins); waiting.delete(id); });
  /** Win rate of `candidate` against `base`; the seeds are split over the workers. */
  async function winRate(candidate, base, seeds) {
    const chunk = Math.ceil(seeds.length / workers.length);
    const parts = Array.from({ length: workers.length }, (_, i) => seeds.slice(i * chunk, (i + 1) * chunk)).filter(part => part.length);
    const wins = await Promise.all(parts.map(part => new Promise(resolve => {
      const id = nextId++;
      waiting.set(id, resolve);
      workers[nextWorker++ % workers.length].postMessage({ id, candidate, base, seeds: part });
    })));
    return wins.reduce((sum, value) => sum + value, 0) / (seeds.length * 2);
  }

  let random = 20261004;
  const uniform = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return (random + 0.5) / 4294967296; };
  const gaussian = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
  // `points` stays fixed as the unit of the scale; the other weights move relative to it.
  const mutate = (weights, sigma) => Object.fromEntries(Object.entries(weights).map(([key, value]) =>
    [key, key === 'points' ? value : Math.round(Math.max(0, value * Math.exp(sigma * gaussian()) + sigma * gaussian()) * 100) / 100]));
  let seedBase = 1000;
  const freshSeeds = count => Array.from({ length: count }, () => seedBase++);

  const CONFIRM_RATE = 0.532;
  let best = { ...defaultWeights }, sigma = 0.35, accepted = 0;
  const started = Date.now();
  console.log(`start ${JSON.stringify(best)}  workers ${workers.length}, ${generations} generations × ${candidates} candidates × ${pairs * 2} matches`);
  for (let generation = 1; generation <= generations; generation++) {
    const seeds = freshSeeds(pairs);
    const pool = Array.from({ length: candidates }, () => mutate(best, sigma));
    const rates = await Promise.all(pool.map(candidate => winRate(candidate, best, seeds)));
    const top = rates.indexOf(Math.max(...rates));
    let line = `gen ${String(generation).padStart(2)}  best candidate ${(rates[top] * 100).toFixed(1)}%`;
    if (rates[top] > 0.53) {
      // The best of several noisy results is biased upwards: confirm on matches it has not seen.
      // 1000+ matches put one standard error near 1.6%, so the bar is about two of them; a looser
      // bar accepts lucky candidates and the weights drift without getting stronger.
      const confirmed = await winRate(pool[top], best, freshSeeds(Math.max(500, pairs * 5)));
      line += `  confirm ${(confirmed * 100).toFixed(1)}%`;
      if (confirmed > CONFIRM_RATE) {
        best = pool[top];
        accepted++;
        line += `  → accepted ${JSON.stringify(best)}`;
      } else sigma *= 0.9;
    } else sigma *= 0.9;
    console.log(line);
  }
  // Final check against the starting weights on matches never used above.
  const final = await winRate(best, defaultWeights, freshSeeds(1000));
  console.log(`\ntrained vs start: ${(final * 100).toFixed(1)}% over 2000 matches (${accepted} improvements, ${Math.round((Date.now() - started) / 1000)}s)`);
  console.log(JSON.stringify(best));
  writeFileSync(new URL('./weights.json', import.meta.url), JSON.stringify({ weights: best, winRateVsStart: final, start: defaultWeights }, null, 2) + '\n');
  await Promise.all(workers.map(worker => worker.terminate()));
}
