import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryPushStore, pusher, subscription } from '../src/push.ts';
import type { Notice, Subscription } from '../src/push.ts';
import { serve, startedMatch } from './helpers.ts';

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const device = (name: string): Subscription => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys });

test('push: only the browsers\' own push services are accepted as subscriptions', () => {
    for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QGuQyavXutnMH', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=1'])
        assert.ok(subscription.safeParse({ endpoint, keys }).success, endpoint);
    for (const endpoint of ['http://fcm.googleapis.com/x', 'https://10.0.0.1/x', 'https://redis.pplale-room-server.svc/x', 'https://fcm.googleapis.com:8443/x', 'https://evil.push.apple.com.example.com/x', 'https://fcm.googleapis.com.example.com/x'])
        assert.ok(!subscription.safeParse({ endpoint, keys }).success, endpoint);
    assert.ok(!subscription.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'short', auth: keys.auth } }).success);
});

test('push: a player keeps a few browsers, a notice is claimed once, and an ended subscription is forgotten', async () => {
    const store = memoryPushStore();
    for (let index = 0; index < 10; index++) await store.add('u', device(String(index)));
    assert.equal((await store.list('u')).length, 8);
    assert.equal(await store.once('k', 1000), true);
    assert.equal(await store.once('k', 1000), false);
    const sent: string[] = [];
    const push = pusher(store, { publicKey: 'p', privateKey: 'q', subject: 'https://pplale.vercel.app' }, async target => {
        sent.push(target.endpoint);
        if (target.endpoint.endsWith('/9')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    });
    await push.tell('u', { title: 't', body: 'b', url: '/', tag: 'x' });
    assert.equal(sent.length, 8);
    assert.equal((await store.list('u')).length, 7);
    // Without keys nothing is sent.
    const quiet: string[] = [];
    await pusher(store, null, async target => { quiet.push(target.endpoint); }).tell('u', { title: 't', body: 'b', url: '/', tag: 'x' });
    assert.deepEqual(quiet, []);
});

test('push: whoever has to act is told when their page is hidden, and not while they are looking', async t => {
    const sent: { endpoint: string; notice: Notice }[] = [];
    const store = memoryPushStore();
    const push = pusher(store, { publicKey: 'p', privateKey: 'q', subject: 'https://pplale.vercel.app' }, async (target, payload) => { sent.push({ endpoint: target.endpoint, notice: JSON.parse(payload) as Notice }); });
    const served = await serve({ push });
    t.after(() => served.close());
    const { id, sockets, first, command } = await startedMatch(served);
    const second = first === 0 ? 1 : 0;
    assert.equal(sockets[0].latest().reportsAway, true);
    for (const seat of [0, 1] as const) {
        while (sockets[seat].latest().game!.openingRemaining[seat] > 0) await command(seat, { type: 'openingDraw', actor: seat, deck: 'yojo' });
    }
    for (const seat of [0, 1] as const) await command(seat, { type: 'keep', actor: seat });
    await Promise.all(sockets.map(socket => socket.until(view => view.game!.phase === 'playing')));
    // The seats belong to signed-in players (set by their ID tokens in real use).
    const room = (await served.backend.get(id))!;
    room.seats[0]!.profileId = 'host-uid';
    room.seats[1]!.profileId = 'guest-uid';
    const expected = room.version++;
    assert.ok(await served.backend.replace(room, expected, 60_000));
    const uid = (seat: 0 | 1) => seat === 0 ? 'host-uid' : 'guest-uid';
    await store.add(uid(first), device('first'));
    await store.add(uid(second), device('second'));
    const settle = () => new Promise(resolve => setTimeout(resolve, 150));
    /** Answers the turn's choices (which deck to draw from), then ends it. */
    async function endTurn(seat: 0 | 1) {
        for (let pending = sockets[seat].latest().game!.pending; pending; pending = sockets[seat].latest().game!.pending)
            assert.equal(await command(seat, { type: 'choose', actor: seat, option: pending.options[0].id }), undefined);
        assert.equal(await command(seat, { type: 'end', actor: seat }), undefined);
    }

    // The second player puts the phone away: the first player's turn ending tells them.
    sockets[second].socket.send(JSON.stringify({ type: 'away', away: true }));
    await settle();
    await endTurn(first);
    await settle();
    assert.deepEqual(sent.map(item => item.endpoint), ['https://fcm.googleapis.com/fcm/send/second']);
    assert.equal(sent[0].notice.title, 'あなたの番だよ');
    assert.equal(sent[0].notice.url, `/game/room/${id}/`);

    // Back on the screen: the next turn is not pushed to the first player, who is looking.
    sockets[second].socket.send(JSON.stringify({ type: 'away', away: false }));
    await settle();
    await sockets[second].until(view => view.game!.active === second);
    await endTurn(second);
    await settle();
    assert.equal(sent.length, 1);
});

test('push: registering needs a signed-in player', async () => {
    const served = await serve();
    const response = await served.call('/push/subscribe', { subscription: device('a') });
    assert.equal(response.status, 401);
    await served.close();
});

test('push: the key browsers subscribe with is given only when the server can send', async () => {
    const quiet = await serve();
    assert.deepEqual(await (await fetch(`${quiet.url}/push/key`)).json(), { publicKey: null });
    await quiet.close();
    const served = await serve({ push: pusher(memoryPushStore(), { publicKey: 'BPublic', privateKey: 'q', subject: 'https://pplale.vercel.app' }) });
    assert.deepEqual(await (await fetch(`${served.url}/push/key`)).json(), { publicKey: 'BPublic' });
    await served.close();
});
