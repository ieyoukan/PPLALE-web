import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.ts';
import { verifyReport } from '../src/report.ts';
import type { MatchRecord } from '../src/report.ts';
import { builtIn, openStore } from '../src/store.ts';
import { compareVerdict, defaultCompareRule } from '@pplale/game-core/ai';
import { train } from '../src/train-job.ts';
import { catalog, playedReport, temporaryDirectory } from './helpers.ts';

// A whole run in miniature. The comparison plays real さいきょう matches, so this takes a while.
test('train: recorded matches and self-play become a candidate, kept back unless clearly stronger', { timeout: 300_000 }, async () => {
    const store = openStore(temporaryDirectory());
    for (const seed of [31, 32, 33]) store.addReport(verifyReport(playedReport(seed).report, catalog) as MatchRecord);
    const base = loadConfig();
    // Two matches can never show a model to be stronger.
    const config = { ...base, version: 'test', training: { ...base.training, threads: 2, selfPlayGames: 200, gateMaxMatches: 2 } };
    const lines: string[] = [];
    const run = await train(store, config, line => lines.push(line));

    assert.equal(run.reports, 3);
    assert.ok(run.positions[0] > 0 && run.positions[1] > 0);
    assert.ok(run.gate.matches <= 2);
    assert.equal(run.published, false);
    assert.equal(run.version, builtIn.version);
    assert.equal(store.currentModel().version, builtIn.version);
    assert.deepEqual(store.training(), { trainedReports: 3, runs: [run] });
    // Self-play is kept for the next run of the same version.
    assert.deepEqual(readdirSync(path.join(store.directory, 'selfplay')).length, 1);
    assert.match(lines.at(-1) ?? '', /not published/);
});

test('train: a model is handed out only when the matches show it is stronger', () => {
    // Even after many matches, an even result is not progress; a clear lead is.
    assert.equal(compareVerdict({ wins: 300, matches: 600 }), false);
    assert.equal(compareVerdict({ wins: 30, matches: 60 }), null);
    assert.equal(compareVerdict({ wins: 120, matches: 200 }), true);
    assert.equal(compareVerdict({ wins: 80, matches: 200 }), false);
    // A smaller cap decides sooner, never in the candidate's favour by default.
    assert.equal(compareVerdict({ wins: 1, matches: 2 }, { ...defaultCompareRule, max: 2 }), false);
});
