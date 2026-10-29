import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers.ts';

test('retired matchmaking endpoints return 410 without creating a queue or room', async t => {
    const served = await serve(); t.after(() => served.close());
    for (const path of ['start', 'status', 'cancel', 'live']) {
        const result = await served.call(`/free-match/${path}`, path === 'live' ? undefined : { token: 'a'.repeat(64) });
        assert.equal(result.status, 410);
        assert.match(result.data.error!, /ルームで対戦/);
    }
    assert.deepEqual(await served.backend.ids(), []);
});
