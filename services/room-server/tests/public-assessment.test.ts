import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HIDDEN_CARD } from '@pplale/game-core';
import type { MatchRecording } from '@pplale/game-core/history';

test('players in rooms and legacy free recordings receive the same public estimate as spectators', async () => {
    const { createRoom, seatView } = await import('../src/rooms.ts');
    const recording = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/replay-v1.json.gz', import.meta.url))).toString()) as MatchRecording;
    const state = structuredClone(recording.frames.find(frame => frame.state.phase === 'playing')!.state);
    for (const mode of [undefined, 'free'] as const) {
        const { room } = createRoom(mode ? '534122' : '534123', { rules: { fruits: ['strawberry'] } });
        room.seats[1] = { ...room.seats[0]!, name: "相手" };
        room.state = state; room.status = 'playing'; room.mode = mode;
        room.record = { id: `estimate-${mode ?? 'private'}`, startedAt: 0 };
        const present = { online: [true, true] as [boolean, boolean], watching: 1 };
        const views = ([0, 1, 'spectator'] as const).map(seat => seatView(room, seat, present));
        assert.ok(views[0].assessment);
        assert.deepEqual(views[0].assessment, views[1].assessment);
        assert.deepEqual(views[0].assessment, views[2].assessment);
        assert.equal(views[0].matchId, room.record.id);
        for (const seat of [0, 1] as const) {
            const view = views[seat];
            for (const uid of state.players[seat === 0 ? 1 : 0].hand) {
                if (!state.cards[uid].revealed) assert.equal(view.game!.cards[uid].cardId, HIDDEN_CARD);
            }
        }
    }
});
