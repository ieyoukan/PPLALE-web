import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MAX_ROOM_CHAT_LENGTH, MAX_ROOM_CHAT_MESSAGES } from '@pplale/game-core/room';
import type { Entered } from '@pplale/game-core/room';
import { catalog } from '../src/catalog.ts';
import { actPlaza, admit, createPlaza, plazaView } from '../src/plaza.ts';
import { connect, deck, serve, shared } from './helpers.ts';

const rules = { fruits: ['strawberry' as const], extendedPlayable: false };
const message = (text: string) => ({ action: 'chat' as const, text, messageId: randomUUID() });

test('chat: member identity, Unicode limits, retry idempotency, bounded room-only history', () => {
    const { room } = createPlaza('123456', { rules, plaza: { visibility: 'public' } }, { name: 'ありす', profileId: 'alice' });
    const owner = room.plaza!.owner!, watcher = admit(room, { name: 'ぼぶ' }).member.id;
    const act = (body: unknown, at: number, member = owner) => actPlaza(room, member, body, catalog, at);
    const first = message('  こんにちは\r\n🍓\u0000  ');
    assert.deepEqual(act({ ...first, name: '偽物', profileId: 'fake' }, 0), { chat: true });
    assert.deepEqual(room.plaza!.chat![0], { id: `${owner}:${first.messageId}`, member: owner, name: 'ありす', profileId: 'alice', text: 'こんにちは\n🍓', sentAt: 0 });
    act(first, 1); // Lost acknowledgement: same id and text never appends twice or hits the rate limit.
    assert.equal(room.plaza!.chat!.length, 1);
    assert.throws(() => act({ ...first, text: '変更' }, 2), /送信済み/);
    assert.throws(() => act(message('速すぎる'), 999), /少し待って/);
    assert.throws(() => act(message(' \n\u0001 '), 1000), /入力/);
    assert.throws(() => act(message('あ'.repeat(MAX_ROOM_CHAT_LENGTH + 1)), 1000), /300文字/);
    assert.throws(() => act({ ...message('x'), messageId: 'invalid' }, 1000), /形式/);
    assert.throws(() => act(message('x'), 1000, 'outsider'), /ルームが見つかりません/);
    act(message('🍓'.repeat(MAX_ROOM_CHAT_LENGTH)), 1000);
    act(message('<img src=x onerror=alert(1)>'), 1000, watcher); // Plain text, never interpreted as HTML.
    const before = structuredClone({ state: room.state, last: room.last, seats: room.seats, rules: room.rules, clock: room.turnClock });
    for (let i = 0; i < MAX_ROOM_CHAT_MESSAGES + 2; i++) act(message(`会話${i}`), 2000 + i * 1000);
    assert.equal(room.plaza!.chat!.length, MAX_ROOM_CHAT_MESSAGES);
    assert.equal(room.plaza!.chat!.at(-1)!.text, `会話${MAX_ROOM_CHAT_MESSAGES + 1}`);
    assert.deepEqual({ state: room.state, last: room.last, seats: room.seats, rules: room.rules, clock: room.turnClock }, before);
    assert.equal(plazaView(room, owner, new Set([owner]), catalog).plaza!.chat!.length, MAX_ROOM_CHAT_MESSAGES);
    assert.equal(plazaView(room, owner, new Set([owner]), catalog, false).plaza!.chat, undefined);
    assert.equal(plazaView(room, owner, new Set([owner]), catalog, false).plaza!.chatEnabled, true);
    const fresh = createPlaza('123457', { rules, plaza: { visibility: 'public' } }, { name: 'ありす' }).room;
    assert.deepEqual(plazaView(fresh, fresh.plaza!.owner!, new Set(), catalog).plaza!.chat, []);
});

test('chat: two pods deliver separate chat frames, preserve play, reconnect history and legacy clients', async t => {
    const data = shared(), a = await serve({ data }), b = await serve({ data });
    t.after(async () => { await a.close(); await b.close(); });
    const made = (await a.call<Entered>('/rooms', { rules, name: 'ありす', plaza: { visibility: 'public' } })).data;
    const id = made.view.id, bob = (await b.call<Entered>(`/rooms/${id}/join`, { name: 'ぼぶ' })).data;
    const alice = await connect(a, id, made.token, {}, true), legacy = await connect(a, id, made.token);
    const other = await connect(b, id, bob.token, {}, true);
    await Promise.all([alice, legacy, other].map(client => client.until(view => view.plaza!.members.filter(member => member.online).length === 2)));
    const sent = message('準備中でも話せる');
    assert.equal(await other.act(sent), undefined);
    for (const client of [alice, other]) assert.equal((await client.untilChat(event => event.messages.some(item => item.text === sent.text))).messages.at(-1)!.name, 'ぼぶ');
    assert.equal(legacy.chats.length, 0);
    assert.equal(legacy.gone(), null);
    await alice.act({ action: 'sit', seat: 0 }); await other.act({ action: 'sit', seat: 1 });
    await alice.act({ action: 'ready', deck }); await other.act({ action: 'ready', deck });
    await Promise.all([alice, other, legacy].map(client => client.until(view => view.status === 'playing')));
    const spectator = (await b.call<Entered>(`/rooms/${id}/join`, { name: '観戦者' })).data;
    const watch = await connect(b, id, spectator.token, {}, true);
    await Promise.all([alice, other, legacy, watch].map(client => client.until(view => view.plaza!.members.filter(member => member.online).length === 3)));
    const before = await a.backend.get(id), views = [alice, other, legacy].map(client => client.views.length);
    const watched = message('観戦からも話せる');
    assert.equal(await watch.act(watched), undefined);
    await Promise.all([alice, other].map(client => client.untilChat(event => event.messages.some(item => item.text === watched.text))));
    assert.deepEqual([alice, other, legacy].map(client => client.views.length), views, 'chat does not send game views or replay the last move');
    const after = await a.backend.get(id);
    assert.deepEqual(after!.state, before!.state);
    assert.deepEqual(after!.last, before!.last);
    await watch.close();
    const reconnected = await connect(a, id, spectator.token, {}, true);
    assert.ok((await reconnected.until(view => !!view.plaza?.chat?.some(item => item.text === watched.text))).watching);
    const count = reconnected.latest().plaza!.chat!.length;
    assert.equal(await reconnected.act(watched), undefined);
    assert.equal((await reconnected.untilChat(event => event.messages.length === count)).messages.length, count);
    const separate = (await a.call<Entered>('/rooms', { rules, name: '別の人', plaza: { visibility: 'public' } })).data;
    assert.deepEqual(separate.view.plaza!.chat, []);
    assert.equal(legacy.chats.length, 0);
});

test('chat: conversation does not invalidate and restart the pending CPU decision', async t => {
    const served = await serve(); t.after(() => served.close());
    const claims: string[] = [], claim = served.backend.claim;
    served.backend.claim = (key, ttl) => { if (key.startsWith('cpu:')) claims.push(key); return claim.call(served.backend, key, ttl); };
    const made = (await served.call<Entered>('/rooms', { rules, name: 'ありす', plaza: { visibility: 'public' } })).data;
    const alice = await connect(served, made.view.id, made.token, {}, true);
    await alice.until(view => !!view.plaza);
    await alice.act({ action: 'cpu', seat: 1, level: 'easy' });
    await alice.act({ action: 'sit', seat: 0 }); await alice.act({ action: 'ready', deck });
    await alice.until(view => view.status === 'playing');
    assert.equal(await alice.act({ action: 'command', command: { type: 'roll', actor: 0 }, revision: alice.latest().game!.revision }), undefined);
    assert.equal(await alice.act(message('CPUを待ちながら話す')), undefined);
    await alice.until(view => view.game!.phase !== 'dice' || view.game!.dice!.rolls[1] !== null);
    assert.equal(claims.length, 1, 'the same pending decision runs once despite the newer chat version');
});


test('chat stamps: fixed catalog, server fallback, shared limits, retries and member permissions', () => {
    const { room } = createPlaza('123456', { rules, plaza: { visibility: 'public' } }, { name: 'ありす' });
    const owner = room.plaza!.owner!, body = { action: 'chat', stamp: 'ageru', messageId: randomUUID() };
    const act = (value: unknown, now = 0, id = owner) => actPlaza(room, id, value, catalog, now);
    assert.deepEqual(act(body), { chat: true });
    const sent = room.plaza!.chat![0];
    assert.equal(sent.stamp, 'ageru'); assert.equal(sent.text, 'スタンプ：あげる');
    act(body, 1); assert.equal(room.plaza!.chat!.length, 1);
    assert.throws(() => act({ ...body, stamp: 'oyasumi' }, 2), /送信済み/);
    assert.throws(() => act(message('文字も連投できない'), 999), /少し待って/);
    for (const invalid of [{ ...body, stamp: 'https://bad/image.png' }, { ...body, stamp: '../private' }, { ...body, text: '二重指定' }, { action: 'chat', messageId: randomUUID() }]) assert.throws(() => act(invalid, 1000), /形式/);
    assert.throws(() => act(body, 1000, 'outsider'), /ルームが見つかりません/);
    assert.equal(plazaView(room, owner, new Set([owner]), catalog).plaza!.chatStamps, true);
    assert.equal(plazaView(room, owner, new Set([owner]), catalog).plaza!.chat![0].stamp, 'ageru');
});
