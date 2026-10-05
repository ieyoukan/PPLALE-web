import test from 'node:test';
import assert from 'node:assert/strict';
import { runTasks } from '../src/pool.ts';

const tasks = Array.from({ length: 8 }, (_, i) => ({ kind: 'selfplay' as const, seeds: [900 + i], share: 1 }));

test('pool: runs every task', async () => {
    const answers = await runTasks(tasks, 3);
    assert.equal(answers.length, tasks.length);
    assert.ok(answers.every(answer => answer.y.length > 0));
});

test('pool: stops once the caller has enough, dropping the rest', async () => {
    const answers = await runTasks(tasks, 3, collected => collected.length >= 2);
    assert.equal(answers.length, 2);
    assert.deepEqual(await runTasks([], 3), []);
});
