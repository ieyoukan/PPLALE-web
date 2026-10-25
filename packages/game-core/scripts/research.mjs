// JSONL transport for TS/Python research. Rule execution stays in game-core.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpuLevels, cpuStrategies, playMatch, sandboxRules } from '../dist/index.js';
import { environmentDecks, environmentRules } from '../dist/ai/value-train.js';
import { RESEARCH_VERSION, canonicalJson, fingerprintData, observeDecision, researchCatalog, researchSchema } from '../dist/research/index.js';
import { catalog } from './catalog.mjs';
import { describeRules, listCommandDefinitions, listExSkills } from '../dist/gameplay/index.js';
import { engineHashes } from './research-contract.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const digest = value => createHash('sha256').update(fingerprintData(value)).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const [task, ...args] = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  const key = args[index], value = args[index + 1];
  if (!['--out', '--games', '--seed', '--share', '--level', '--max-commands', '--exploration'].includes(key) || options.has(key) || !value || value.startsWith('--'))
    throw new Error(`Invalid/duplicate research option: ${key}`);
  options.set(key, value);
}
const option = (key, fallback) => options.get(`--${key}`) ?? fallback;
const integer = (key, fallback, min) => {
  const n = Number(option(key, fallback));
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`--${key} must be an integer >= ${min}`);
  return n;
};
if (!['catalog', 'collect'].includes(task)) throw new Error('Usage: cpu:research catalog|collect --out path [--games 10] [--seed 1000000] [--share 0.2] [--level hard] [--max-commands 4000]');
if (!option('out')) throw new Error('--out path is required (existing files are never overwritten)');
const out = path.resolve(root, option('out'));
const games = task === 'collect' ? integer('games', 10, 1) : 0;
const seedStart = integer('seed', 1_000_000, 0), maxCommands = integer('max-commands', 4000, 1);
if (seedStart + games > 0xffffffff) throw new Error('Seeds must fit uint32');
const share = Number(option('share', 0.2)), level = option('level', 'hard');
const exploration = Number(option('exploration', 0));
if (!Number.isFinite(exploration) || exploration < 0 || exploration > 1) throw new Error('Invalid exploration rate');
if (!Number.isFinite(share) || share <= 0 || share > 1) throw new Error('--share must be > 0 and <= 1');
if (!cpuLevels.includes(level)) throw new Error(`Unknown CPU level: ${level}`);
const profiles = researchCatalog(catalog);
const game = { rules: describeRules(), commands: listCommandDefinitions(), exSkills: listExSkills() };
const manifest = {
  type: 'manifest', version: RESEARCH_VERSION, schema: researchSchema, catalog: profiles,
  schemaHash: digest(researchSchema), catalogHash: digest(profiles),
  game, gameHash: digest(game),
  provenance: { engineCommit: git(['rev-parse', 'HEAD']), ...engineHashes(), definitionsHash: digest(catalog),
    exporterHash: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    workingTreeDirty: !!git(['status', '--porcelain']),
    seedStart, games, share, exploration, splitPolicy: 'environment-block-v1', levels: [level, level], rules: sandboxRules, maxCommands,
    runtime: process.version, deckGenerator: 'environmentDecks', sampling: 'every-playing-decision-independent-lcg-v1' },
};
mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const file = openSync(out, 'wx');
const write = value => writeSync(file, canonicalJson(value) + '\n');
let total = 0, unfinished = 0;
try {
  write(manifest);
  for (let game = 0; game < games; game++) {
    const seed = seedStart + game, samples = [], viewers = [];
    const decks = environmentDecks(catalog, seed), matchId = `seed:${seed}`;
    const bucket = Math.floor(seed / 8) % 10;
    const split = bucket === 0 ? 'test' : bucket === 1 ? 'validation' : 'train';
    const strategy = { ...cpuStrategies[level], choose: d => d.state.phase === 'playing' && d.random(1000000) < exploration * 1000000
      ? d.moves[d.random(d.moves.length)] : cpuStrategies[level].choose(d) };
    let r = (seed ^ 0x517cc1b7) >>> 0;
    const result = playMatch(catalog, { levels: exploration ? [strategy, strategy] : [level, level], seed, decks, maxCommands, onStep(state, command, side) {
      r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
      if (state.phase !== 'playing' || r / 4294967296 >= share) return;
      const { observation, selectedAction } = observeDecision(state, side, catalog, command);
      samples.push({ type: 'decision', matchId, viewer: side, step: state.revision, split,
        observation, selectedAction });
      viewers.push(side);
    } });
    write({ type: 'match', matchId, split, seed, environment: environmentRules(seed), decks, result, decisions: samples.length });
    for (const [index, sample] of samples.entries()) write({ ...sample,
      outcome: result.winner === null ? 'unfinished' : result.winner === 'draw' ? 'draw' : result.winner === viewers[index] ? 'win' : 'loss' });
    total += samples.length;
    if (result.winner === null) unfinished++;
  }
  write({ type: 'summary', games, decisions: total, unfinished });
} finally { closeSync(file); }
const coverage = Object.values(profiles).reduce((counts, card) => ({ ...counts, [card.coverage]: (counts[card.coverage] ?? 0) + 1 }), {});
console.log(JSON.stringify({ file: path.resolve(out), games, decisions: total, unfinished, coverage, schemaHash: manifest.schemaHash, catalogHash: manifest.catalogHash }));
