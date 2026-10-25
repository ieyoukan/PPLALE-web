import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { demoReports, importFeedback, verifiedReplay, replaySamples, replaySplit } from '../scripts/feedback.mjs';

test('feedback: replay-derived labels, stable splits, deduplication, and rejection of forged/unfinished reports', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pplale-feedback-'));
  try {
    const reports = path.join(directory, 'reports.jsonl'), output = path.join(directory, 'dataset.jsonl');
    demoReports(reports, 9100000, 1);
    const body = JSON.parse(readFileSync(reports, 'utf8').trim());
    const first = verifiedReplay(body);
    assert.notEqual(first.record.winner, body.winner, 'sender-supplied winner is deliberately wrong');
    const renamed = { ...body, day: '2099-01-01', model: 'changed', winner: first.record.winner };
    assert.equal(verifiedReplay(renamed).hash, first.hash, 'non-game metadata cannot change the split');
    const invalid = { ...body, commands: [{ type: 'sandbox', actor: 0 }] };
    assert.throws(() => verifiedReplay(invalid), /commands/);
    assert.throws(() => verifiedReplay({ ...body, commands: body.commands.slice(0, 2) }), /finished|replayed/);
    writeFileSync(reports, [body, renamed, invalid].map(row => JSON.stringify(row)).join('\n'));
    assert.throws(() => importFeedback(reports, output), /No usable/);
    const result = importFeedback(reports, output, 'synthetic-smoke');
    assert.equal(result.games, 1);
    assert.equal(result.duplicates, 1);
    assert.equal(result.rejected.length, 1);
    const rows = readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows[0].provenance.origin, 'synthetic-smoke');
    const match = rows.find(row => row.type === 'match');
    assert.equal(match.split, replaySplit(first.hash));
    assert.equal(match.result.winner, first.record.winner);
    assert.ok(result.decisions > 0);
    for (const sample of rows.filter(row => row.type === 'decision')) {
      assert.equal(sample.outcome, first.record.winner === sample.viewer ? 'win' : 'loss');
      assert.equal('replay' in sample.observation, false);
      assert.equal(sample.observation.winner, null);
    }
    assert.throws(() => importFeedback(reports, output, 'synthetic-smoke'), /EEXIST/);
    const slotted = structuredClone(first.record);
    // Explicitly choosing the default field position is equivalent to the representative action.
    // Engine playback and selected-action lookup must both accept it.
    const index = slotted.commands.findIndex(command => command.type === 'play');
    slotted.commands[index].slot = 0;
    const verified = verifiedReplay({ ...slotted, _synthetic: true });
    assert.ok(replaySamples(verified.record, `replay:${verified.hash}`, replaySplit(verified.hash)).length);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
