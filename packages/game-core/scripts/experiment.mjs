// Research-only execution: explicit algorithm specifications, paired games, and immutable JSONL evidence.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, openSync, closeSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { cpuStrategies, createMaster, createPooledEvaluator, createValueEvaluator, playMatch, valueModel } from '../dist/ai/index.js';
import { evaluatePlan } from '../dist/ai/planning.js';
import { environmentDecks, environmentRules } from '../dist/ai/value-train.js';
import { researchCatalog, researchSchema, fingerprintData, poolSpec, poolNames } from '../dist/research/index.js';
import { describeRules, listCommandDefinitions, listExSkills } from '../dist/gameplay/index.js';
import { deckRuleErrors, randomDeck } from '../dist/rules.js';
import { singleCopy } from '../dist/setup.js';
import { catalog } from './catalog.mjs';
import { engineHashes } from './research-contract.mjs';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
export const digest = value => createHash('sha256').update(fingerprintData(value)).digest('hex');
export const fileHash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const profiles = researchCatalog(catalog), game = { rules: describeRules(), commands: listCommandDefinitions(), exSkills: listExSkills() };
export const contract = { schemaHash: digest(researchSchema), catalogHash: digest(profiles), gameHash: digest(game), poolHash: digest(poolSpec()), rulesEngineHash: engineHashes().rulesEngineHash };
export function provenance() {
  const source = new URL('../src/', import.meta.url);
  return { ...contract, node: process.version, engineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
    workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
    sourceHash: digest(readdirSync(source, { recursive: true }).filter(name => name.endsWith('.ts')).sort().map(name => [name, fileHash(new URL(name, source))])),
    runnerHash: fileHash(fileURLToPath(import.meta.url)) };
}

export function makeStrategy(spec) {
  if (!spec || typeof spec.id !== 'string') throw new Error('Algorithm requires an ID');
  if (spec.kind === 'level') {
    if (!cpuStrategies[spec.level]) throw new Error('Unknown CPU level');
    return cpuStrategies[spec.level];
  }
  if (!['legacy-search', 'rule-search', 'pooled-search'].includes(spec.kind)) throw new Error('Unknown algorithm kind');
  const options = spec.search ?? {};
  for (const [key, value] of Object.entries(options)) {
    if (key === 'lethal') {
      if (!value || typeof value !== 'object' || Object.entries(value).some(([k, v]) => !(['endTurn', 'split', 'symmetry'].includes(k) ? typeof v === 'boolean'
          : k === 'rollout' && Number.isInteger(v) && v >= 0 && v <= 32))) throw new Error('Invalid lethal options');
      continue;
    }
    if (!['maxNodes', 'beamWidth', 'maxDepth', 'worlds', 'candidates', 'lethalNodes'].includes(key)
        || !Number.isInteger(value) || value < 1 || value > 20000) throw new Error(`Invalid search option: ${key}`);
  }
  const legacy = createValueEvaluator(valueModel);
  let evaluate = spec.kind === 'rule-search' ? evaluatePlan : legacy;
  if (spec.kind === 'pooled-search') {
    const model = read(spec.model);
    if (spec.modelHash !== fileHash(spec.model)) throw new Error('Model file changed after plan was frozen');
    for (const key of ['schemaHash', 'catalogHash', 'gameHash', 'poolHash'])
      if (model[key] !== contract[key]) throw new Error(`Model ${key} differs from this engine`);
    if (model.rulesEngineHash && model.rulesEngineHash !== contract.rulesEngineHash) throw new Error('Model executable rules differ from this engine');
    const learned = createPooledEvaluator(model), blend = spec.blend ?? 1;
    if (!Number.isFinite(blend) || blend < 0 || blend > 1) throw new Error('Invalid blend');
    evaluate = (s, side, cards) => blend * learned(s, side, cards) + (1 - blend) * legacy(s, side, cards);
  }
  return { ...createMaster({ ...options, evaluate }), name: spec.id };
}

function timedStrategy(strategy, durations) {
  return { ...strategy, choose(d) {
    const start = performance.now(), move = strategy.choose(d);
    durations.push(performance.now() - start);
    return move;
  } };
}

export function pairedMatch(job) {
  const candidate = makeStrategy(job.candidate), opponent = makeStrategy(job.opponent);
  const rules = environmentRules(job.seed), decks = job.decks ?? environmentDecks(catalog, job.seed);
  for (const deck of decks) {
    const errors = deckRuleErrors(deck, rules, catalog);
    if (errors.length) throw new Error(errors.join(' / '));
  }
  const matches = [];
  for (const seat of [0, 1]) {
    // CPU comparisons keep decks attached to seats; deck comparisons keep decks attached to their policies.
    const pair = job.deckComparison && seat === 1 ? [decks[1], decks[0]] : decks;
    const durations = [], opposingDurations = [], actions = {}, plays = {};
    let first = null;
    const a = timedStrategy(candidate, durations), b = timedStrategy(opponent, opposingDurations);
    const start = performance.now();
    const result = playMatch(catalog, { seed: job.seed, decks: pair, levels: seat === 0 ? [a, b] : [b, a], maxCommands: job.maxCommands,
      onStep(state, command, actor) {
        if (state.phase === 'playing') first = state.rules.firstPlayer;
        if (actor === seat) {
          actions[command.type] = (actions[command.type] ?? 0) + 1;
          if (command.type === 'play') { const id = state.cards[command.uid].cardId; plays[id] = (plays[id] ?? 0) + 1; }
        }
      } });
    matches.push({ ...result, candidateSeat: seat, firstPlayer: first, milliseconds: performance.now() - start,
      candidateDecisionMs: durations, opponentDecisionMs: opposingDurations, actions, plays,
      score: result.winner === seat ? 1 : result.winner === 'draw' ? 0.5 : 0 });
  }
  return { type: 'pair', index: job.index, candidate: job.candidate.id, opponent: job.opponent.id, seed: job.seed,
    environment: rules, decks, deckComparison: !!job.deckComparison, matches,
    score: (matches[0].score + matches[1].score) / 2, unfinished: matches.filter(match => match.winner === null).length };
}

/** Deterministic legal mutations; deck search is bounded by an explicitly chosen copy limit. */
export function deckCandidates(seed, count, copyLimit = 2, incumbent = null) {
  const environment = environmentRules(seed), definitions = Object.values(profiles);
  let rng = seed >>> 0;
  const next = n => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); };
  const base = incumbent ?? randomDeck(environment, catalog, seed);
  if (!base || !Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(copyLimit) || copyLimit < 1 || copyLimit > 20)
    throw new Error('Invalid deck search parameters');
  const valid = deck => !deckRuleErrors(deck, environment, catalog).length && ['yojo', 'sweet'].every(kind =>
    deck[kind].every(id => deck[kind].filter(card => card === id).length <= (singleCopy(catalog, id) ? 1 : copyLimit)));
  const key = d => JSON.stringify([d.playable, [...d.yojo].sort(), [...d.sweet].sort()]);
  const decks = new Map();
  if (valid(base)) decks.set(key(base), base);
  for (let attempt = 0; decks.size < count && attempt < count * 100; attempt++) {
    const candidate = structuredClone(attempt % 4 === 0 ? randomDeck(environment, catalog, seed + attempt + 1) : base);
    const kind = next(5) === 0 ? 'playable' : next(3) === 0 ? 'sweet' : 'yojo';
    const pool = definitions.filter(card => card.type === kind && (kind === 'playable' || environment.fruits.includes(card.fruit)));
    if (kind === 'playable') candidate.playable = pool[next(pool.length)].id;
    else for (let n = 0; n < 1 + attempt % 3; n++) candidate[kind][next(candidate[kind].length)] = pool[next(pool.length)].id;
    candidate.name = `candidate-${decks.size}`;
    if (valid(candidate)) decks.set(key(candidate), candidate);
  }
  if (decks.size < count) throw new Error('Could not generate enough distinct legal decks');
  return [...decks.values()];
}

export async function executePlan(config, output) {
  if (!config || config.version !== 'pplale-experiment-v1' || !['screen', 'validation', 'test', 'deck-screen', 'deck-test'].includes(config.phase))
    throw new Error('Invalid experiment plan');
  if (!Array.isArray(config.jobs) || !config.jobs.length || config.jobs.length > 20000) throw new Error('Invalid job count');
  const keys = new Set();
  for (const job of config.jobs) {
    if (!Number.isInteger(job.seed) || job.seed < 0 || job.seed > 0xffffffff || !Number.isInteger(job.maxCommands) || job.maxCommands < 1 || job.maxCommands > 4000)
      throw new Error('Invalid game limits');
    const key = `${job.candidate.id}:${job.opponent.id}:${job.seed}`;
    if (keys.has(key)) throw new Error('Repeated comparison seed for the same candidate');
    keys.add(key);
    makeStrategy(job.candidate); makeStrategy(job.opponent);
  }
  const workers = Math.min(4, Math.max(1, config.workers ?? 2));
  mkdirSync(path.dirname(output), { recursive: true });
  const file = openSync(output, 'wx'), write = row => writeSync(file, JSON.stringify(row) + '\n');
  const start = Date.now();
  write({ type: 'manifest', version: config.version, planHash: digest(config), plan: config, provenance: provenance() });
  let completed = 0;
  const pool = [];
  try {
    await new Promise((resolve, reject) => {
      let cursor = 0;
      const next = worker => {
        if (cursor < config.jobs.length) worker.postMessage({ ...config.jobs[cursor], index: cursor++ });
      };
      for (let i = 0; i < Math.min(workers, config.jobs.length); i++) {
        const worker = new Worker(new URL(import.meta.url)); pool.push(worker);
        worker.on('error', reject);
        worker.on('exit', code => { if (completed < config.jobs.length) reject(new Error(`Experiment worker exited (${code})`)); });
        worker.on('message', answer => {
          if (answer.error) { reject(new Error(answer.error)); return; }
          write(answer);
          completed++;
          if (completed % 8 === 0 || completed === config.jobs.length) console.error(`${config.phase}: ${completed}/${config.jobs.length} pairs`);
          if (completed === config.jobs.length) resolve(); else next(worker);
        });
        next(worker);
      }
    });
    write({ type: 'summary', pairs: completed, seconds: (Date.now() - start) / 1000 });
  } finally { await Promise.all(pool.map(worker => worker.terminate())); closeSync(file); }
}

if (!isMainThread) {
  parentPort.on('message', job => {
    try { parentPort.postMessage(pairedMatch(job)); } catch (error) { parentPort.postMessage({ error: error.stack }); }
  });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [task, ...args] = process.argv.slice(2);
  if (task === 'describe') console.log(JSON.stringify({ ...contract, spec: poolSpec(), featureNames: poolNames(poolSpec()), catalog: profiles, game, provenance: provenance() }));
  else if (task === 'run') {
    if (args.length !== 2) throw new Error('run <plan.json> <results.jsonl>');
    await executePlan(read(args[0]), args[1]);
  } else if (task === 'decks') {
    if (args.length < 2 || args.length > 4) throw new Error('decks <seed> <count> [copyLimit] [incumbent.json]');
    console.log(JSON.stringify(deckCandidates(Number(args[0]), Number(args[1]), Number(args[2] ?? 2), args[3] ? read(args[3]) : null)));
  } else throw new Error('Use describe, run, or decks');
}
