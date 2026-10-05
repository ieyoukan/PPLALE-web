import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.ts';
import { verifyReport } from '../src/report.ts';
import type { MatchRecord } from '../src/report.ts';
import { builtIn, openStore } from '../src/store.ts';
import { gateVerdict, train } from '../src/train-job.ts';
import { catalog, playedReport, temporaryDirectory } from './helpers.ts';

// A whole run in miniature. The comparison plays real さいきょう matches, so this takes a while.
test('train: recorded matches and self-play become a published model', { timeout: 300_000 }, async () => {
    const store = openStore(temporaryDirectory());
    for (const seed of [31, 32, 33]) store.addReport(verifyReport(playedReport(seed).report, catalog) as MatchRecord);
    const base = loadConfig();
    const config = { ...base, version: 'test', training: { ...base.training, threads: 2, selfPlayGames: 200, gatePairs: 1, gateMinRate: 0, gateEarlyLead: 0 } };
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

test('train: the comparison stops as soon as the result is clear', () => {
    const rule = { minRate: 0.5, earlyLead: 6, total: 300 };
    assert.equal(gateVerdict({ wins: 10, matches: 20 }, rule), null);
    // 6 wins ahead of half: 21 of 30. 6 behind: 9 of 30.
    assert.equal(gateVerdict({ wins: 20, matches: 30 }, rule), null);
    assert.equal(gateVerdict({ wins: 21, matches: 30 }, rule), true);
    assert.equal(gateVerdict({ wins: 9, matches: 30 }, rule), false);
    // Never clear: the rate after every match decides.
    assert.equal(gateVerdict({ wins: 150, matches: 300 }, rule), true);
    assert.equal(gateVerdict({ wins: 149, matches: 300 }, rule), false);
    // Without early stopping only the end counts.
    assert.equal(gateVerdict({ wins: 30, matches: 30 }, { ...rule, earlyLead: 0 }), null);
    // A stricter rate moves the line the lead is measured from.
    assert.equal(gateVerdict({ wins: 21, matches: 30 }, { ...rule, minRate: 0.55 }), null);
});
