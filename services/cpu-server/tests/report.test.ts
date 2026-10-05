import test from 'node:test';
import assert from 'node:assert/strict';
import { valueLayout } from '@pplale/game-core/ai';
import { recordPositions, verifyReport } from '../src/report.ts';
import type { MatchRecord } from '../src/report.ts';
import { catalog, playedReport } from './helpers.ts';

const accepted = (body: unknown) => {
    const record = verifyReport(body, catalog, '2026-10-05');
    assert.ok(!('error' in record), 'error' in record ? record.error : '');
    return record as MatchRecord;
};
const rejected = (body: unknown) => assert.ok('error' in verifyReport(body, catalog));

test('report: a played match is accepted and its winner comes from the replay', () => {
    const { report, winner } = playedReport(11);
    const record = accepted({ ...report, winner: winner === 0 ? 1 : 0 });
    assert.equal(record.winner, winner);
    assert.equal(record.day, '2026-10-05');
    assert.equal(record.model, 'test-model');
    assert.ok(record.turns > 1);
});

test('report: nothing but decks, seed and commands is kept', () => {
    const { report } = playedReport(12);
    const record = accepted({ ...report, name: 'someone', decks: report.decks.map(deck => ({ ...deck, name: 'my deck' })), commands: report.commands.map(command => ({ ...command, note: 'x' })) });
    assert.deepEqual(Object.keys(record).sort(), ['commands', 'day', 'decks', 'id', 'level', 'model', 'seed', 'turns', 'winner']);
    assert.deepEqual(Object.keys(record.decks[0]).sort(), ['playable', 'sweet', 'yojo']);
    assert.ok(!JSON.stringify(record).includes('my deck') && !JSON.stringify(record).includes('note'));
});

test('report: the same match always gets the same id', () => {
    const { report } = playedReport(13);
    assert.equal(accepted(report).id, accepted({ ...report, model: 'other' }).id);
    assert.notEqual(accepted(report).id, accepted(playedReport(14).report).id);
});

test('report: unfinished, unplayable and other-level matches are rejected', () => {
    const { report } = playedReport(15);
    rejected({ ...report, commands: report.commands.slice(0, -1) });
    rejected({ ...report, commands: [...report.commands, report.commands.at(-1)] });
    rejected({ ...report, seed: report.seed + 1 });
    rejected({ ...report, level: 'hard' });
    rejected({ ...report, decks: [report.decks[0], { ...report.decks[1], yojo: report.decks[1].yojo.slice(1) }] });
    rejected({ ...report, commands: [{ type: 'adjust', actor: 0, resource: 'points', delta: -12 }, ...report.commands] });
    rejected({ ...report, commands: 'end' });
    rejected(null);
});

test('report: a stored match gives one training position per turn', () => {
    const { report, winner } = playedReport(16);
    const record = accepted(report), positions = recordPositions(record, catalog);
    assert.ok(positions);
    assert.equal(positions.won, winner === 0 ? 1 : 0);
    assert.ok(positions.rows.length >= record.turns && positions.rows.length <= record.turns * 2);
    assert.ok(positions.rows.every(row => row.length === valueLayout.full * 2));
    // A record whose result no longer matches the engine is left out of training.
    assert.equal(recordPositions({ ...record, winner: record.winner === 0 ? 1 : 0 }, catalog), null);
});
