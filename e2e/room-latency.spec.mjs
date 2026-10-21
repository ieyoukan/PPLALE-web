import { test, expect } from '@playwright/test';
import { arena, catalog, field, hand } from '../packages/game-core/tests/helpers.mjs';
import { applyCommand, viewFor } from '../packages/game-core/dist/index.js';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to an app built with a room-server URL');
test.setTimeout(60_000);

async function board(page, initial, random = .99) {
  const requests = [];
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
    });
  });
  await page.goto(`${base}/game/room/?id=123456`);
  await expect(page.locator('[data-table]')).toBeVisible();
  await page.evaluate(random => { Math.random = () => random; }, random);
  return {
    requests,
    reply(error) {
      const request = requests.at(-1);
      if (!request) throw new Error('No request');
      if (!error) {
        const result = applyCommand(current, request.action.command, catalog);
        if (result.error) throw new Error(result.error);
        current = result.state;
        socket.send(JSON.stringify({ type: 'view', view: view(request.action.command) }));
      }
      socket.send(JSON.stringify({ type: 'result', n: request.n, ...(error && { error }) }));
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
