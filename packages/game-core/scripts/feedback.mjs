// Offline ingestion of existing CPU-server reports. Labels are obtained by replay, never trusted.
import { readFileSync, statSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyReport } from '../../../services/cpu-server/src/report.ts';
import { newGame, applyCommand, sandboxRules, playMatch } from '../dist/index.js';
import { environmentDecks } from '../dist/ai/value-train.js';
import { fruits, fruitsUpTo, isExtendedPlayable } from '../dist/rules.js';
import { describeRules, listCommandDefinitions, listExSkills } from '../dist/gameplay/index.js';
import { RESEARCH_VERSION, researchSchema, researchCatalog, observeDecision } from '../dist/research/index.js';
import { engineHashes, digest, fileHash } from './research-contract.mjs';
import { provenance } from './experiment.mjs';
import { catalog } from './catalog.mjs';

export const replaySplit = hash => ['test', 'validation'][Number.parseInt(hash.slice(0, 8), 16) % 10] ?? 'train';
export function verifiedReplay(body) {
  const record = verifyReport(body, catalog, '1970-01-01');
  if ('error' in record) throw new Error(record.error);
  const replay = { seed: record.seed, decks: record.decks, commands: record.commands };
  return { record, replay, hash: digest(replay) };
}

export function replaySamples(record, matchId, split) {
  const samples = [];
  let state = newGame(record.decks.map(deck => ({ ...deck, name: 'feedback' })), catalog, sandboxRules, record.seed);
  for (const command of record.commands) {
    if (state.phase === 'playing') {
      // Field placement has no rule semantics. The legal-action API offers one representative slot.
      const selected = command.type === 'play' ? { type: 'play', actor: command.actor, uid: command.uid } : command;
      const { observation, selectedAction } = observeDecision(state, command.actor, catalog, selected);
      samples.push({ type: 'decision', matchId, split, viewer: command.actor, step: state.revision,
        observation, selectedAction, outcome: record.winner === command.actor ? 'win' : 'loss' });
    }
    const result = applyCommand(state, command, catalog);
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  if (state.winner !== record.winner) throw new Error('Replay outcome changed');
  return samples;
}

export function importFeedback(input, output, origin = 'human-report') {
  if (!['human-report', 'synthetic-smoke'].includes(origin)) throw new Error('Unknown feedback origin');
  if (statSync(input).size > 100 * 1024 * 1024) throw new Error('Split report files into batches of at most 100 MiB');
  const lines = readFileSync(input, 'utf8').split('\n').filter(line => line.trim());
  if (lines.length > 1000) throw new Error('Use at most 1000 reports per batch');
  const accepted = [], seen = new Set(), rejected = [];
  let duplicates = 0;
  for (const [index, line] of lines.entries()) {
    try {
      const body = JSON.parse(line);
      if (body._synthetic && origin !== 'synthetic-smoke') throw new Error('Synthetic data must be explicitly marked synthetic-smoke');
      const item = verifiedReplay(body);
      if (seen.has(item.hash)) { duplicates++; continue; }
      // Verify action enumeration too, before accepting the report as usable training data.
      const matchId = `replay:${item.hash}`, split = replaySplit(item.hash);
      replaySamples(item.record, matchId, split);
      seen.add(item.hash);
      accepted.push({ ...item, matchId, split });
    } catch (error) { rejected.push({ line: index + 1, reason: error.message }); }
  }
  if (!accepted.length) throw new Error(`No usable reports: ${JSON.stringify(rejected)}`);
  const profiles = researchCatalog(catalog), game = { rules: describeRules(), commands: listCommandDefinitions(), exSkills: listExSkills() };
  const manifest = { type: 'manifest', version: RESEARCH_VERSION, schema: researchSchema, catalog: profiles,
    schemaHash: digest(researchSchema), catalogHash: digest(profiles), game, gameHash: digest(game),
    provenance: { ...provenance(), ...engineHashes(), definitionsHash: digest(catalog), exporterHash: fileHash(new URL(import.meta.url)),
      seedStart: 0, games: accepted.length, share: 1, maxCommands: 3000, runtime: process.version,
      deckGenerator: 'verified-report', sampling: 'every-playing-command', splitPolicy: 'replay-hash-v1',
      levels: ['reported-human', 'reported-master'], rules: sandboxRules, origin, inputHash: fileHash(input),
      verification: 'current-engine replay; claimed outcomes and annotations ignored', duplicates, rejected } };
  mkdirSync(path.dirname(output), { recursive: true });
  const file = openSync(output, 'wx'), write = value => writeSync(file, JSON.stringify(value) + '\n');
  let decisions = 0;
  try {
    write(manifest);
    for (const { record, replay, hash, matchId, split } of accepted) {
      const samples = replaySamples(record, matchId, split);
      const used = record.decks.flatMap(d => [...d.yojo, ...d.sweet]).map(id => catalog[id].fruit);
      const newest = fruits.filter(fruit => used.includes(fruit)).at(-1) ?? 'strawberry';
      const environment = { fruits: fruitsUpTo(newest), extendedPlayable: record.decks.some(d => isExtendedPlayable(catalog, d.playable)) };
      write({ type: 'match', matchId, replayHash: hash, replay, seed: record.seed, split, environment,
        environmentSource: 'minimum environment inferred from decks; original lobby not recorded',
        result: { winner: record.winner, turns: record.turns, commands: record.commands.length }, decisions: samples.length });
      for (const sample of samples) write(sample);
      decisions += samples.length;
    }
    write({ type: 'summary', games: accepted.length, decisions, unfinished: 0 });
  } finally { closeSync(file); }
  return { games: accepted.length, decisions, duplicates, rejected, origin };
}

export function demoReports(output, seed = 6800000, count = 8) {
  if (!Number.isInteger(count) || count < 1 || count > 80) throw new Error('Demo count must be 1..80');
  mkdirSync(path.dirname(output), { recursive: true });
  const file = openSync(output, 'wx');
  let games = 0;
  try {
    for (let i = 0; i < count; i++) {
      const commands = [], decks = environmentDecks(catalog, seed + i);
      const result = playMatch(catalog, { seed: seed + i, decks, levels: ['normal', 'hard'], maxCommands: 600,
        onStep(_state, command) { commands.push(command); } });
      if (result.winner === null || result.winner === 'draw') continue;
      // The report transport accepts "master" only; this fixture is explicitly NOT human/master evidence.
      writeSync(file, JSON.stringify({ _synthetic: true, level: 'master', model: 'synthetic-normal-vs-hard', seed: seed + i,
        decks, commands, winner: 1 - result.winner }) + '\n'); // Deliberately wrong: importer must derive the real label.
      games++;
    }
  } finally { closeSync(file); }
  return { games, origin: 'synthetic-smoke' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [task, input, output, origin] = process.argv.slice(2);
  if (task === 'import' && input && output) console.log(JSON.stringify(importFeedback(input, output, origin)));
  else if (task === 'demo' && input) console.log(JSON.stringify(demoReports(input, output === undefined ? undefined : Number(output), origin === undefined ? undefined : Number(origin))));
  else throw new Error('feedback.mjs import <reports.jsonl> <dataset.jsonl> [human-report|synthetic-smoke] | demo <reports.jsonl> [seed] [count]');
}
