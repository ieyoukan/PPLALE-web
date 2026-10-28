import { test, expect } from '@playwright/test';
import { arena, run } from '../packages/game-core/tests/helpers.mjs';
import { viewFor } from '../packages/game-core/dist/index.js';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');

async function room(page, seat = 0, direct = false) {
  const id = '123456'; let socket, version = 0;
  let game = arena({ me: { hand: ['y_0'] }, foe: { hand: ['y_1'] } }); game.active = seat;
  let playing = direct;
  const messages = [];
  const view = () => ({ id, version: ++version, status: playing ? 'playing' : 'lobby', match: 1, matchId: 'camera-match', seat, spectators: 0,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, last: null, resigned: null,
    players: [0, 1].map(side => ({ member: side === seat ? 'me' : 'friend', name: side === seat ? 'あなた' : 'フレンド', online: true, ready: playing })),
    game: playing ? viewFor(game, seat) : null,
    plaza: { name: '星空のルーム', visibility: 'invite', me: 'me', owner: 'me', creator: { name: 'あなた' },
      members: [{ id: 'me', name: 'あなた', online: true }, { id: 'friend', name: 'フレンド', online: true }], invite: 'test' },
  });
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => {
    socket = ws; ws.onMessage(bytes => {
      const message = JSON.parse(String(bytes)); messages.push(message);
      if (message.type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view() }));
      if (message.type === 'action') {
        if (message.action.action === 'command') {
          game = run(game, message.action.command);
          ws.send(JSON.stringify({ type: 'view', view: { ...view(), last: { command: message.action.command } } }));
        }
        ws.send(JSON.stringify({ type: 'result', n: message.n }));
      }
    });
  });
  await page.goto(`${base}/game/room/${id}/`);
  await expect(page.locator('[data-room-scene]')).toBeVisible();
  return { messages, uid: game.players[seat].hand[0], show: active => { playing = active; socket.send(JSON.stringify({ type: 'view', view: view() })); } };
}

for (const { seat, viewport } of [
  { seat: 0, viewport: { width: 1280, height: 800 } },
  { seat: 1, viewport: { width: 1280, height: 800 } },
  { seat: 0, viewport: { width: 390, height: 844 } },
]) test(`camera preserves the room and interactive board from seat ${seat} at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
  await page.setViewportSize(viewport);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { show, messages, uid } = await room(page, seat);
  await expect(page.locator('[data-room-camera="lobby"]')).toBeVisible();
  await page.evaluate(() => {
    window.__sceneWatch = { nodes: ['[data-room-scene]', '[data-room-floor]', '[data-room-desk]'].map(selector => document.querySelector(selector)), frames: 0, missing: 0, running: true };
    const sample = () => { const watch = window.__sceneWatch; if (!watch.running) return; watch.frames++; if (watch.nodes.some(node => !node?.isConnected || !node.checkVisibility())) watch.missing++; requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  show(true);
  await expect(page.locator('[data-room-camera="moving"]')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(260);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-room-floor]').parentElement).transform === getComputedStyle(document.querySelector('[data-room-board-projection]')).transform)).toBe(true);
  await page.screenshot({ path: info.outputPath('camera-midway.png') });
  await expect(page.locator('[data-room-camera="match"]')).toBeVisible();
  await expect(page.locator('[data-room-scene] [data-table]')).toHaveCount(1);
  await expect(page.locator('[data-in-scene]')).toHaveCSS('display', 'contents');
  const roomBounds = await page.locator('[data-room-view]').boundingBox();
  await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
  await page.getByRole('button', { name: '場に出す', exact: true }).click();
  await expect(page.locator(`[data-room-scene] [data-unit="${uid}"]`)).toBeVisible();
  expect(await page.locator('[data-room-view]').boundingBox()).toEqual(roomBounds);
  await expect(page.getByRole('button', { name: 'メニュー', exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('camera-in-match.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'ゲームメニュー', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  show(false);
  await expect(page.locator('[data-room-camera="lobby"]')).toBeVisible();
  const watch = await page.evaluate(() => { const watch = window.__sceneWatch; watch.running = false; return { frames: watch.frames, missing: watch.missing }; });
  expect(watch.frames).toBeGreaterThan(10); expect(watch.missing).toBe(0);
  expect(messages.filter(message => message.type === 'hello')).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const reduced of [false, true]) test(`direct match entry and reduced motion avoid an extra camera flight (${reduced})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const { show } = await room(page, 0, !reduced);
  if (reduced) show(true);
  await expect(page.locator('[data-room-camera="match"]')).toBeVisible({ timeout: 20000 });
  const animations = await page.locator('[data-room-floor]').evaluate(floor => floor.parentElement.getAnimations().filter(animation => animation.playState === 'running').length);
  expect(animations).toBe(0);
  await expect(page.locator('[data-scene-ready="true"]')).toHaveCount(1);
});

test('dragging a hand card onto the persistent table uses the same input and animation root', async ({ page }) => {
  const { uid, messages } = await room(page, 0, true);
  await expect(page.locator('[data-room-camera="match"]')).toBeVisible({ timeout: 20000 });
  const roomBounds = await page.locator('[data-room-view]').boundingBox();
  const hand = await page.locator(`[data-hand-list] [data-hand="${uid}"]`).boundingBox();
  const slot = await page.locator('[data-side="0"][data-slot="0"]').boundingBox();
  await page.mouse.move(hand.x + hand.width / 2, hand.y + 25);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(`[data-room-scene] [data-unit="${uid}"]`)).toBeVisible();
  expect(messages.some(message => message.action?.command?.type === 'play')).toBe(true);
  expect(await page.locator('[data-room-view]').boundingBox()).toEqual(roomBounds);
});

test('cancelling a camera animation still enables the settled match controls', async ({ page }) => {
  const { show } = await room(page);
  await expect(page.locator('[data-room-camera="lobby"]')).toBeVisible();
  show(true);
  await expect(page.locator('[data-room-camera="moving"]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-room-floor]').evaluate(floor => floor.parentElement.getAnimations().forEach(animation => animation.cancel()));
  await expect(page.locator('[data-room-camera="match"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'メニュー', exact: true })).toBeInViewport();
  await expect(page.locator('[data-scene-ready="true"]')).toHaveCount(1);
});
