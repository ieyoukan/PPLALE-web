import { test, expect } from '@playwright/test';
import { arena, catalog, field, hand } from '../packages/game-core/tests/helpers.mjs';
import { applyCommand, viewFor } from '../packages/game-core/dist/index.js';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to an app built with a room-server URL');
test.setTimeout(60_000);

async function board(page, initial, random = .99) {
  const requests = [], reports = [];
  let socket, current = initial, version = 1;
  const view = command => ({
    id: '123456', version: version++, match: 1, seat: 0, spectators: 0, status: 'playing',
    rules: { fruits: ['strawberry', 'grape', 'melon'], extendedPlayable: true },
    players: [{ name: 'あなた', ready: true, online: true }, { name: '相手', ready: true, online: true }],
    game: viewFor(current, 0), last: command ? { command } : null, resigned: null,
  });
  await page.addInitScript(() => {
    localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ '123456': { seat: 0, token: 'test-token', at: Date.now() } }));
  });
  await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => {
    socket = ws;
    ws.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view() }));
      else if (message.type === 'action') requests.push(message);
      else if (message.type === 'performance') reports.push(...message.reports);
    });
  });
  await page.goto(`${base}/game/room/?id=123456`);
  await expect(page.locator('[data-table]')).toBeVisible();
  await page.evaluate(random => { Math.random = () => random; }, random);
  return {
    requests, reports,
    reply(error, measured = false) {
      const request = requests.at(-1);
      if (!request) throw new Error('No request');
      if (!error) {
        const result = applyCommand(current, request.action.command, catalog);
        if (result.error) throw new Error(result.error);
        current = result.state;
        socket.send(JSON.stringify({ type: 'view', view: view(request.action.command) }));
      }
      socket.send(JSON.stringify({ type: 'result', n: request.n, ...(error && { error }), ...(measured && {revision:current.revision,timing:{queue:1,read:2,apply:3,store:4,presence:5,deliver:6,publish:7,total:28}}) }));
      return current;
    },
    commitWithoutReply() {
      const result = applyCommand(current, requests.at(-1).action.command, catalog);
      if (result.error) throw new Error(result.error);
      current = result.state;
      return current;
    },
    opponent(command) {
      const result = applyCommand(current, command, catalog);
      if (result.error) throw new Error(result.error);
      current = result.state;
      socket.send(JSON.stringify({ type: 'view', view: view(command) }));
    },
  };
}
const freeze = async page => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
};
const click = async locator => {
  await locator.evaluate(element => element.click());
  await locator.page().clock.runFor(20);
};

test('a play automatically records network, server and shown-board timings and batches a private report',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const initial=arena({me:{field:['y_0']}}),uid=field(initial)[0];
  const room=await board(page,initial);
  await page.locator(`[data-unit="${uid}"]`).click();
  await page.locator('[data-leader="1"] button').first().click();
  await expect.poll(()=>room.requests.length).toBe(1);
  await page.waitForTimeout(100);const after=room.reply(undefined,true);
  await expect.poll(async()=>({count:await page.evaluate(()=>performance.getEntriesByName('pplale:room-command-roundtrip').length),errors})).toEqual({count:1,errors:[]});
  await expect(page.locator('[data-leader="1"]').getByRole('button',{name:`お菓子ポイント ${after.players[1].points}`,exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pplale-room-performance-v1')||'[]').length)).toBe(1);
  const samples=await page.evaluate(()=>JSON.parse(localStorage.getItem('pplale-room-performance-v1')||'[]'));
  expect(samples).toHaveLength(1);expect(samples[0].kind).toBe('attack');expect(samples[0].outcome).toBe('ok');
  expect(samples[0].server.store).toBe(4);expect(samples[0].roundTrip).toBeGreaterThanOrEqual(100);
  expect(samples[0].inputToPaint).toBeGreaterThan(samples[0].roundTrip);
  expect(samples[0].viewToPaint).toBeGreaterThan(30);
  expect(room.reports).toHaveLength(0);
  await expect.poll(()=>room.reports.length,{timeout:15000}).toBe(1);
  expect(Object.keys(room.reports[0]).sort()).toEqual(['n','background','inputToSend','roundTrip','sendToView','viewToPaint','inputToPaint'].sort());
  expect(JSON.stringify(samples)).not.toMatch(/あなた|相手|test-token|123456|cardId|"uid"/);
  await page.goto(`${base}/game/performance/`);
  await expect(page.getByRole('heading',{name:'通信計測',exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /記録 \d+ 件/ })).toContainText('記録 1 件');
  await expect(page.getByRole('heading',{name:'サーバー処理の内訳'})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'JSONを書き出す'}).click();expect((await download).suggestedFilename()).toBe('pplale-play-performance.json');
  await page.getByRole('button',{name:'この端末の記録を消す'}).click();await expect(page.getByRole('status').filter({ hasText: /記録 \d+ 件/ })).toContainText('記録 0 件');
  await page.screenshot({path:'/tmp/pplale-play-performance-desktop.png',fullPage:true});
});

test('attack is sent while its animation clock is frozen, once only, and the result waits for the hit', async ({ page }) => {
  const initial = arena({ me: { field: ['y_0'] } });
  const uid = field(initial)[0];
  const room = await board(page, initial);
  await page.locator(`[data-unit="${uid}"]`).click();
  await expect(page.locator(`[data-unit="${uid}"]`)).toHaveClass(/attacking/);
  await freeze(page);
  const target = page.locator('[data-leader="1"] button').first();
  await click(target);
  await click(target);
  await expect.poll(() => room.requests.length).toBe(1);
  expect(room.requests[0].action.command).toEqual({ type: 'attack', actor: 0, uid, target: 'leader' });
  const after = room.reply();
  const counter = page.locator('[data-leader="1"]');
  await expect(counter.getByRole('button', { name: `お菓子ポイント ${initial.players[1].points}`, exact: true })).toBeVisible();
  // Follow the same CSS timing as the board; room animations share the CPU pace.
  const strike = await page.locator('[data-readable]').evaluate(element => parseFloat(element.style.getPropertyValue('--strike-duration')));
  await page.clock.runFor(strike / 2);
  await expect(counter.getByRole('button', { name: `お菓子ポイント ${after.players[1].points}`, exact: true })).toBeVisible();
  await page.clock.runFor(strike / 2);
  await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeEnabled();
});

test('a fake reaction wait does not delay sending a card or confirm its play in advance', async ({ page }) => {
  const initial = arena({ me: { hand: ['y_9'] }, foe: { hand: ['y_17', 'y_17', 'y_17'] } });
  const uid = hand(initial)[0];
  const room = await board(page, initial, 0);
  await page.locator(`[data-hand="${uid}"]`).click();
  await expect(page.getByRole('button', { name: '場に出す', exact: true })).toBeEnabled();
  await freeze(page);
  await click(page.getByRole('button', { name: '場に出す', exact: true }));
  await expect.poll(() => room.requests.length).toBe(1);
  await expect(page.locator(`[data-hand="${uid}"][data-submitting]`)).toBeVisible();
  room.reply();
  await expect(page.locator(`[data-unit="${uid}"]`)).toHaveCount(0);
  await page.clock.runFor(920);
  await expect(page.locator(`[data-unit="${uid}"]`)).toBeVisible();
  expect(room.requests).toHaveLength(1);
});

test('a refused attack cancels the presentation and unlocks the unchanged board', async ({ page }) => {
  const initial = arena({ me: { field: ['y_0'] } });
  const uid = field(initial)[0];
  const room = await board(page, initial);
  await page.locator(`[data-unit="${uid}"]`).click();
  await expect(page.locator(`[data-unit="${uid}"]`)).toHaveClass(/attacking/);
  await freeze(page);
  await click(page.locator('[data-leader="1"] button').first());
  await expect.poll(() => room.requests.length).toBe(1);
  room.reply('盤面が更新されました。もう一度操作してください');
  await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeEnabled();
  await expect(page.locator(`[data-unit="${uid}"]`)).toBeVisible();
  await page.clock.runFor(1500);
  expect(room.requests).toHaveLength(1);
});

test('an unanswered request reconnects to the committed board without resending it', async ({ page }) => {
  const initial = arena({ me: { hand: ['y_17'] } });
  const uid = hand(initial)[0];
  const room = await board(page, initial);
  await page.locator(`[data-hand="${uid}"]`).click();
  await expect(page.getByRole('button', { name: '場に出す', exact: true })).toBeEnabled();
  await freeze(page);
  await click(page.getByRole('button', { name: '場に出す', exact: true }));
  await expect.poll(() => room.requests.length).toBe(1);
  room.commitWithoutReply();
  await page.clock.runFor(12_100);
  await expect(page.getByRole('alert').filter({ hasText: '応答を確認できませんでした' })).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.locator(`[data-unit="${uid}"]`)).toBeVisible();
  await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeEnabled();
  expect(room.requests).toHaveLength(1);
});

test('opening draws remain independent while the opponent has a card in flight', async ({ page }) => {
  const initial = arena();
  initial.phase = 'opening';
  initial.openingRemaining = [3, 4];
  const room = await board(page, initial);
  const deck = page.locator('button[data-deck="0-yojo"]');
  await expect(deck).toBeEnabled();
  await freeze(page);
  await click(deck);
  await expect.poll(() => room.requests.length).toBe(1);
  room.reply();
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(1);
  const draw = await page.locator('[data-readable]').evaluate(element => parseFloat(element.style.getPropertyValue('--draw-duration')));
  await page.clock.runFor(draw * .75);
  room.opponent({ type: 'openingDraw', actor: 1, deck: 'yojo' });
  await expect(page.getByRole('group', { name: '相手の手札 1枚', exact: true })).toBeAttached();
  await page.clock.runFor(draw * .75);
  await expect(page.locator('[data-draw-flight]')).toHaveCount(1);
  await expect(deck).toBeEnabled();
  await click(deck);
  await expect.poll(() => room.requests.length).toBe(2);
  room.reply();
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(2);
});


for (const kind of ['opening', 'effect']) test(`${kind} room draws overlap after acknowledgement, but never predict a draw`, async ({ page }) => {
  let initial = arena();
  if (kind === 'opening') { initial.phase = 'opening'; initial.openingRemaining = [3, 4]; }
  else initial = applyCommand(initial, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, catalog, true).state;
  const room = await board(page, initial);
  const deck = page.locator(`button[data-deck="0-${kind === 'opening' ? 'yojo' : 'sweet'}"]`);
  await expect(deck).toBeEnabled();
  await freeze(page);
  await click(deck);
  await expect.poll(() => room.requests.length).toBe(1);
  await page.clock.runFor(350);
  await expect(deck).toBeDisabled();
  await deck.evaluate(button => button.click());
  expect(room.requests).toHaveLength(1);
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(0);
  room.reply();
  await page.clock.runFor(40);
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(1);
  await expect(page.locator('[data-draw-flight]')).toHaveCount(1);
  await expect(deck).toBeEnabled();
  await click(deck);
  await expect.poll(() => room.requests.length).toBe(2);
  room.reply();
  await page.clock.runFor(40);
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(2);
  await expect(page.locator('[data-draw-flight]')).toHaveCount(2);
  await page.clock.runFor(1200);
  expect(room.requests).toHaveLength(2);
  await expect(page.locator('[data-draw-flight]')).toHaveCount(0);
});
