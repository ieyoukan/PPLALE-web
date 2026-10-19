// Is a CPU variant stronger than さいきょう as it is? Plays them against each other with the same
// sequential test the CPU server uses before handing out a model (compareVerdict), and appends the
// result to experiments.jsonl so every attempt stays on record.
//   npm run cpu:compare -- <name> [--model file.json] [--policy file.json] [--search '{"maxNodes":4800}']
//                                 [--against file.json] [--decks all|strawberry|records.jsonl] [--max 600]
// --model: the position value to use (default: the built-in one). --policy: a move value
// (ai/policy.ts). --search: TurnSearchOptions. --against: the value model of the other side
// (default: the built-in one). --decks: random decks of every environment (default), いちご only,
// or the deck pairs of recorded matches. Seats are swapped on the same seed, so luck cancels.
import { appendFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { compareVerdict, cpuStrategies, createMaster, createValueEvaluator, defaultCompareRule, parseValueModel, playMatch, valueModel } from '../dist/ai/index.js';
import { createPolicy } from '../dist/ai/policy.js';
import { environmentDecks } from '../dist/ai/value-train.js';
import { catalog } from './catalog.mjs';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
/** A file name in --decks: the deck pairs people played (CPU server records), in turn. */
const recordedPairs = file => readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line).decks.map((d, i) => ({ ...d, name: String(i) })));

if (!isMainThread) {
  const { model, policy, search, against, decks } = workerData;
  const value = model ? parseValueModel(read(model)) : valueModel;
  if (!value) throw new Error(`${model} does not fit this build's features`);
  const candidate = createMaster({ evaluate: createValueEvaluator(value), ...(policy && { policy: createPolicy(read(policy), catalog) }), ...search });
  const other = against ? createMaster({ evaluate: createValueEvaluator(parseValueModel(read(against))) }) : cpuStrategies.master;
  const pairs = decks !== 'all' && decks !== 'strawberry' ? recordedPairs(decks) : null;
  parentPort.on('message', seed => {
    const pair = pairs ? { decks: pairs[seed % pairs.length] } : decks === 'all' ? { decks: environmentDecks(catalog, seed) } : {};
    let wins = 0, matches = 0;
    for (const [levels, seat] of [[[candidate, other], 0], [[other, candidate], 1]]) {
      const { winner } = playMatch(catalog, { levels, seed, ...pair });
      if (winner === 0 || winner === 1) { matches++; if (winner === seat) wins++; }
    }
    parentPort.postMessage({ wins, matches });
  });
} else {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || name.startsWith('--')) throw new Error('usage: npm run cpu:compare -- <name> [--model f] [--policy f] [--search json] [--against f] [--decks all|strawberry|records.jsonl] [--max n]');
  const option = key => { const i = rest.indexOf(`--${key}`); return i >= 0 ? rest[i + 1] : undefined; };
  const job = { model: option('model'), policy: option('policy'), search: JSON.parse(option('search') ?? '{}'), against: option('against'), decks: option('decks') ?? 'all' };
  const rule = { ...defaultCompareRule, max: Number(option('max') ?? defaultCompareRule.max) };
  const started = Date.now(), seeds = Array.from({ length: Math.ceil(rule.max / 2) }, (_, i) => 6_000_000 + i);
  const tally = { wins: 0, matches: 0 };
  let verdict = null;
  await new Promise(done => {
    let running = 0;
    for (let i = 0; i < Math.max(1, os.cpus().length - 1); i++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: job });
      const next = () => {
        const seed = verdict === null ? seeds.shift() : undefined;
        if (seed === undefined) { worker.terminate(); if (--running === 0) done(); } else worker.postMessage(seed);
      };
      worker.on('message', answer => {
        if (verdict === null) {
          tally.wins += answer.wins; tally.matches += answer.matches;
          verdict = compareVerdict(tally, rule);
          if (tally.matches % 50 < 2) console.log(`  ${tally.wins}/${tally.matches}`);
        }
        next();
      });
      worker.on('error', error => { console.error(error); process.exit(1); });
      running++;
      next();
    }
  });
  verdict ??= compareVerdict(tally, { ...rule, max: tally.matches });
  const rate = tally.wins / Math.max(1, tally.matches), se = Math.sqrt(rate * (1 - rate) / Math.max(1, tally.matches));
  const result = { name, at: new Date().toISOString(), ...job, ...tally, rate: Math.round(rate * 1000) / 1000, ci95: [rate - 1.96 * se, rate + 1.96 * se].map(v => Math.round(v * 1000) / 1000), stronger: verdict, minutes: Math.round((Date.now() - started) / 60000) };
  appendFileSync(new URL('../experiments.jsonl', import.meta.url), JSON.stringify(result) + '\n');
  console.log(`${name}: ${tally.wins}/${tally.matches} (${(rate * 100).toFixed(1)}%) → ${verdict ? 'stronger' : 'not stronger'}; recorded in experiments.jsonl`);
}
