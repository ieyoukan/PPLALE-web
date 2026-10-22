import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HIDDEN_CARD } from '@pplale/game-core';
import type { GameState } from '@pplale/game-core';
import type { FreeMatchActivity } from '@pplale/game-core/room';
import type { MatchRecording } from '@pplale/game-core/history';
import { serve, deck, connect } from './helpers.ts';
import { fixture, historyAvailable } from './history-helpers.ts';
import { publicAssessment } from '../src/public-matches.ts';
import { catalog } from '../src/catalog.ts';
import type { Room } from '../src/rooms.ts';

test('public free activity exposes names/icons, never queue secrets or decks; spectators have no actions', async t => {
    const served = await serve(); t.after(served.close);
    const a = { token: 'a'.repeat(64), name: 'A', deck }, b = { token: 'b'.repeat(64), name: 'B', deck };
    await served.call('/free-match/start', a);
    const waiting = (await served.call<FreeMatchActivity>('/free-match/live')).data;
    assert.deepEqual(waiting.waiting, [{ name: 'A', playable: deck.playable }]);
    const result = (await served.call<{ roomId: string }>('/free-match/start', b)).data;
    const watched = await connect(served, result.roomId, null);
    const view = await watched.until(view => !!view.watching);
    assert.equal(await watched.act({ action: 'resign' }), '観戦中は操作できません');
    for (const player of view.game!.players) for (const uid of player.hand) assert.equal(view.game!.cards[uid].cardId, HIDDEN_CARD);
    const exposed = JSON.stringify(waiting);
    for (const value of [a.token, b.token, 'historyOwners', 'sweet', 'yojo', 'tokenHash']) assert.equal(exposed.includes(value), false);
});

test('public live assessment depends only on visible information, never the identities or order of hidden cards', () => {
    const recording = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/replay-v1.json.gz', import.meta.url))).toString()) as MatchRecording;
    const state = structuredClone(recording.frames.find(frame => frame.state.phase === 'playing')!.state);
    const room = { id: '123456', state, record: { id: 'public-a', startedAt: Date.now() } } as Room;
    const a = publicAssessment(room, catalog); assert.ok(a); assert.ok(Number.isFinite(a.win));
    const hidden = structuredClone(state) as GameState;
    for (const player of hidden.players) {
        player.yojo.reverse(); player.sweet.reverse();
        for (const uid of player.hand) if (!hidden.cards[uid].revealed) hidden.cards[uid].cardId = 'y_1';
    }
    const b = publicAssessment({ ...room, record: { id: 'public-b', startedAt: 0 }, state: hidden }, catalog);
    assert.deepEqual(a, b);
});

test('a spectator can open the full free replay only after the match ends; private room history stays private', { skip: !historyAvailable }, async t => {
    const { history, backend, onClose } = await fixture(t);
    const served = await serve({ history, data: { open: () => backend } }); onClose(served.close);
    const headers = (letter: string) => ({ 'x-history-key': letter.repeat(64) });
    await served.call('/free-match/start', { token: 'a'.repeat(64), name: 'A', deck }, headers('a'));
    const matched = (await served.call<{ roomId: string }>('/free-match/start', { token: 'b'.repeat(64), name: 'B', deck }, headers('b'))).data;
    const room = (await history.get(matched.roomId))!;
    assert.equal(await history.recording(['device:outsider'], room.record!.id), null);
    const observer = await connect(served, room.id, null), player = await connect(served, room.id, 'a'.repeat(64));
    await player.act({ action: 'resign' });
    const finished = await observer.until(view => view.status === 'finished');
    assert.equal(finished.replayId, room.record!.id);
    const replay = await history.recording(['device:outsider'], finished.replayId!);
    assert.equal(replay!.match.complete, true); assert.deepEqual(replay!.match.players[0].deck, deck);
});

test('rolling updates do not enable public spectators until every live pod can redact both hands', async t => {
    const served = await serve(); t.after(served.close);
    await served.backend.beat('old-audience-unaware-pod', 0, 60_000);
    const player = (letter: string) => ({ token: letter.repeat(64), name: letter, deck });
    await served.call('/free-match/start', player('a'));
    const first = (await served.call<{ roomId: string }>('/free-match/start', player('b'))).data;
    assert.equal((await served.backend.get(first.roomId))!.rules.spectators, false);
    assert.equal(await (await connect(served, first.roomId, null)).closed, 4404);
    await served.backend.forget('old-audience-unaware-pod');
    await served.call('/free-match/start', player('c'));
    const next = (await served.call<{ roomId: string }>('/free-match/start', player('d'))).data;
    assert.equal((await served.backend.get(next.roomId))!.rules.spectators, true);
});

test('watching the public lounge does not spend the request budget for creating or joining a match', async t => {
    const served = await serve({ requestsPerHour: 2 }); t.after(served.close);
    for (let at = 0; at < 3; at++) assert.equal((await served.call('/free-match/live')).status, 200);
    assert.equal((await served.call('/rooms', { rules: { fruits: ['strawberry'] } })).status, 200);
});

test('players in private rooms and free matches receive the same public estimate as spectators', async () => {
    const { createRoom, seatView } = await import('../src/rooms.ts');
    const recording = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/replay-v1.json.gz', import.meta.url))).toString()) as MatchRecording;
    const state = structuredClone(recording.frames.find(frame => frame.state.phase === 'playing')!.state);
    for (const mode of [undefined, 'free'] as const) {
        const { room } = createRoom(mode ? '534122' : '534123', { rules: { fruits: ['strawberry'] } });
        room.seats[1] = { ...room.seats[0], name: '相手' };
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
