import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';
import { viewFor } from '../packages/game-core/dist/index.js';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to an app with a room server URL');

test('room downloads the pool without decoding it, waits for revealed cards, and preserves the board on later reveals', async ({ page }) => {
  let socket, version = 0, game = arena({ me: { hand: ['y_0'] }, foe: { hand: ['y_1'] } });
  const requests = [], errors = [];
  page.on('request', request => { if (request.url().includes('/game-assets/cards/')) requests.push(request.resourceType()); });
  page.on('pageerror', error => errors.push(error.message));
  const view = playing => ({ id: '123456', version: ++version, status: playing ? 'playing' : 'lobby', match: 1, matchId: 'warm-match', seat: 0, spectators: 0,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, last: null, resigned: null,
    players: [{ member: 'me', name: 'あなた', online: true, ready: playing }, { member: 'friend', name: 'フレンド', online: true, ready: playing }], game: playing ? viewFor(game, 0) : null,
    plaza: { name: '画像準備のルーム', visibility: 'invite', me: 'me', owner: 'me', creator: { name: 'あなた' }, invite: 'test', members: [{ id: 'me', name: 'あなた', online: true }, { id: 'friend', name: 'フレンド', online: true }] } });
  await page.addInitScript(() => {
    localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: '123456', rooms: { '123456': { token: 'test', at: Date.now() } } }));
    window.decodes = []; window.releaseDecodes = []; window.holdDecode = false;
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      const source = this.currentSrc || this.src;
      if (source.includes('/game-assets/cards/')) {
        window.decodes.push(source);
        if (window.holdDecode && /\/y_0-/.test(source)) await new Promise(resolve => window.releaseDecodes.push(resolve));
      }
    };
  });
  await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => {
    socket = ws;
    ws.onMessage(bytes => { if (JSON.parse(String(bytes)).type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view(false) })); });
  });
  await page.goto(`${base}/game/room/123456/`);
  await expect(page.locator('[data-room-camera="lobby"]')).toBeVisible();
  await expect.poll(() => requests.filter(type => type === 'fetch').length).toBeGreaterThan(30);
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.decodes)).toEqual([]);
  expect(requests.every(type => type === 'fetch')).toBe(true);
  await page.evaluate(() => { window.roomNode = document.querySelector('[data-room-scene]'); window.holdDecode = true; });
  socket.send(JSON.stringify({ type: 'view', view: view(true) }));
  await expect.poll(() => page.evaluate(() => window.releaseDecodes.length)).toBeGreaterThan(0);
  await expect(page.locator('[data-room-camera="lobby"]')).toBeVisible();
  expect(await page.evaluate(() => window.roomNode === document.querySelector('[data-room-scene]'))).toBe(true);
  await page.evaluate(() => { window.holdDecode = false; window.releaseDecodes.splice(0).forEach(resolve => resolve()); });
  await expect(page.locator('[data-room-camera="match"]')).toBeVisible();
  const decoded = await page.evaluate(() => window.decodes);
  expect(decoded.some(source => /\/y_0-/.test(source))).toBe(true);
  expect(decoded.some(source => /\/y_1-/.test(source))).toBe(false);
  expect(new Set(decoded).size).toBeLessThan(10);
  const cacheHits = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/game-assets/cards/') && entry.initiatorType === 'img').map(entry => entry.transferSize));
  expect(cacheHits.length).toBeGreaterThan(0);
  expect(cacheHits.every(bytes => bytes === 0)).toBe(true);
  await page.evaluate(() => { window.boardNode = document.querySelector('[data-table]'); });
  game = arena({ me: { hand: ['y_0'] }, foe: { field: ['y_1'] } }); game.revision = 1;
  socket.send(JSON.stringify({ type: 'view', view: view(true) }));
  await expect(page.locator(`[data-unit="${game.players[1].field[0]}"]`)).toBeVisible();
  expect(await page.evaluate(() => window.boardNode === document.querySelector('[data-table]'))).toBe(true);
  await expect(page.locator('[data-room-camera="match"]')).toBeVisible();
  const imageSizes = await page.locator('[data-room-scene] img[src*="/game-assets/cards/"]').evaluateAll(images => Promise.all(images.map(async image => { await image.decode(); return image.naturalWidth; })));
  expect(imageSizes.length).toBeGreaterThan(0);
  expect(imageSizes.every(width => width === 640)).toBe(true);
  expect(errors).toEqual([]);
});
