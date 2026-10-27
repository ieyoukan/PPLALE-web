import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');

async function load(page, game) {
  const id = '123456';
  let socket;
  const view = {
    id, version: 1, seat: 0, spectators: 0, status: 'playing', match: 1,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: false },
    players: [{ name: 'あなた', online: true, ready: true }, { name: '相手', online: true, ready: true }],
    game, last: null, resigned: null,
  };
  await page.addInitScript(id => {
    localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ [id]: { seat: 0, token: 'test', at: Date.now() } }));
    localStorage.setItem('pplale-show-assessment', 'hidden');
  }, id);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, route => {
    socket = route;
    route.onMessage(data => {
      if (JSON.parse(String(data)).type === 'hello') route.send(JSON.stringify({ type: 'view', view }));
    });
  });
  await page.goto(`${base}/game/room/${id}/`);
  await expect(page.locator('[data-table]')).toBeVisible({ timeout: 20000 });
  return next => socket.send(JSON.stringify({ type: 'view', view: { ...view, version: 2, game: next } }));
}
async function watchBoard(page) {
  await page.evaluate(() => {
    const table = document.querySelector('[data-table]');
    window.__boardFrames = { hidden: 0, samples: 0, running: true };
    const sample = () => {
      const frames = window.__boardFrames;
      if (!frames.running) return;
      frames.samples++;
      if (!table.isConnected || !table.getClientRects().length || !table.checkVisibility()) frames.hidden++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
async function verifyBoard(page) {
  const frames = await page.evaluate(() => { window.__boardFrames.running = false; return window.__boardFrames; });
  expect(frames.samples).toBeGreaterThan(10);
  expect(frames.hidden).toBe(0);
}

for (const overlay of ['MenuPanel', 'MulliganBoard', 'Launchpad']) test(`${overlay} loading keeps the board on screen`, async ({ page }) => {
  let delayed = 0;
  let opening = false;
  await page.route('**/*.js*', async route => {
    if (opening && route.request().resourceType() === 'script') { delayed++; await new Promise(resolve => setTimeout(resolve, 900)); }
    await route.continue();
  });
  const game = overlay === 'MulliganBoard' ? arena({ me: { hand: ['y_0', 's_0'] }, foe: { hand: ['y_1'] } }) : arena();
  if (overlay === 'MulliganBoard') { game.phase = 'opening'; game.openingRemaining = [1, 0]; }
  const update = await load(page, game);
  await watchBoard(page);
  opening = true;
  if (overlay !== 'MulliganBoard') {
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ゲームメニュー', exact: true })).toBeVisible();
    if (overlay === 'Launchpad') {
      await page.getByRole('button', { name: 'ゲームメニュー', exact: true }).click();
      const pad = page.getByRole('dialog', { name: 'ゲームメニュー' });
      await pad.getByRole('button', { name: 'カード', exact: true }).click();
      await expect(pad.getByRole('link', { name: /図鑑/ })).toBeVisible();
      await pad.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
      await expect(pad).toHaveCount(0);
    } else {
      await page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
      await page.getByRole('button', { name: 'メニュー', exact: true }).click();
      await expect(page.getByRole('button', { name: 'ゲームメニュー', exact: true })).toBeVisible();
    }
  } else {
    update({ ...game, revision: game.revision + 1, phase: 'mulligan', openingRemaining: [0, 0] });
    await expect(page.getByRole('region', { name: '初期手札の交換' })).toBeVisible({ timeout: 20000 });
  }
  if (overlay !== 'MulliganBoard') expect(delayed).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  await verifyBoard(page);
});
