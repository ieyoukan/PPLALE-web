import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.ts';
import { verifyReport } from '../src/report.ts';
import type { MatchRecord } from '../src/report.ts';
import { builtIn, openStore } from '../src/store.ts';
import { train } from '../src/train-job.ts';
import { catalog, playedReport, temporaryDirectory } from './helpers.ts';

// A whole run in miniature. The comparison plays real さいきょう matches, so this takes a while.
test('train: recorded matches and self-play become a published model', { timeout: 300_000 }, async () => {
    const store = openStore(temporaryDirectory());
    for (const seed of [31, 32, 33]) store.addReport(verifyReport(playedReport(seed).report, catalog) as MatchRecord);
    const base = loadConfig();
    const config = { ...base, version: 'test', training: { ...base.training, threads: 2, selfPlayGames: 200, gatePairs: 1, gateMinRate: 0 } };
    const lines: string[] = [];
    const run = await train(store, config, line => lines.push(line));

    assert.equal(run.reports, 3);
    assert.ok(run.positions[0] > 0 && run.positions[1] > 0);
    assert.deepEqual(run.gate.matches, 2);
    assert.equal(run.published, true);
    assert.notEqual(run.version, builtIn.version);
    assert.equal(store.currentModel().version, run.version);
    assert.deepEqual(store.training(), { trainedReports: 3, runs: [run] });
    // Self-play is kept for the next run of the same version.
    assert.deepEqual(readdirSync(path.join(store.directory, 'selfplay')).length, 1);
    assert.ok(existsSync(path.join(store.directory, 'models', `${run.version}.json`)));
    assert.equal(lines.length, 4);
});
