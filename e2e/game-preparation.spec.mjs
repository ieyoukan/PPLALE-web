import { test, expect } from '@playwright/test';
import { arena, hand } from '../packages/game-core/tests/helpers.mjs';

test('game menu loads small font subsets without fetching match assets', async ({ page }) => {
  const assets = [], fonts = new Map();
  page.on('request', request => { if (request.url().includes('/game-assets/cards/')) assets.push(request.url()); });
  page.on('response', response => { if (response.url().includes('/fonts/generated/')) fonts.set(response.url(), response); });
  await page.goto('/game/cpu/');
  await expect(page.getByRole('button', { name: /対戦をはじめる/ })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  expect(assets).toEqual([]);
  expect(fonts.size).toBeLessThanOrEqual(6);
  let bytes = 0;
  for (const response of fonts.values()) { expect(response.ok()).toBe(true); bytes += (await response.body()).length; }
  expect(bytes).toBeLessThan(300_000);
});

test('CPU start waits for card downloads before saving or entering a match', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let requested = 0;
  await page.route('**/game-assets/cards/**', async route => { requested++; await held; await route.continue(); });
  await page.goto('/game/cpu/');
  await page.getByRole('button', { name: /対戦をはじめる/ }).click();
  await expect.poll(() => requested).toBeGreaterThan(0);
  await expect(page.getByRole('progressbar', { name: '対戦データの準備' })).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(/^\/game\/(?:cpu\/|room\/\d{6}\/)$/);
  expect(await page.evaluate(() => localStorage.getItem('pplale-game-session-v2'))).toBeNull();
  release();
  await expect(page).toHaveURL(/\/game\/play\//);
  await expect(page.locator('[data-table]')).toBeVisible();
});

test('a failed download keeps the menu usable and can be retried', async ({ page }) => {
  await page.route('**/game-assets/cards/**', route => route.abort());
  await page.goto('/game/cpu/');
  await page.getByRole('button', { name: /対戦をはじめる/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: '画像を準備できませんでした' })).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(/^\/game\/(?:cpu\/|room\/\d{6}\/)$/);
  await page.unroute('**/game-assets/cards/**');
  await page.getByRole('button', { name: /対戦をはじめる/ }).click();
  await expect(page).toHaveURL(/\/game\/play\//);
});

test('restored play prepares first and reuses images when showing a card', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const game = arena({ me: { hand: ['y_9'] } });
  await page.goto('/game/cpu/');
  await page.evaluate(game => localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode:'hotseat', levels:['normal','normal'] })), game);
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
  // Only count actual network transfers; cached reuse at another size is allowed.
  const ready = await page.evaluate(() => performance.now());
  await page.locator(`[data-hand="${hand(game)[0]}"]`).click();
  await expect(page.getByRole('button', { name: '場に出す', exact:true })).toBeVisible();
  await page.waitForTimeout(1000);
  const downloads = await page.evaluate(ready => performance.getEntriesByType('resource').filter(entry => entry.startTime > ready && entry.transferSize > 0 && /\.(?:avif|webp|woff2?|ttf)(?:\?|$)/.test(entry.name)).map(entry => entry.name), ready);
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
});

test('room readiness is sent only after its public card pool is prepared', async ({ page }) => {
  test.skip(!process.env.PPLALE_ROOM_TEST_URL, 'requires a build connected to a room server');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const actions = [];
  let requested = 0;
  await page.route('**/game-assets/cards/**', async route => { requested++; await held; await route.continue(); });
  await page.addInitScript(() => localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ '123456': { seat:0, token:'test-token', at:Date.now() } })));
  await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => ws.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'hello') ws.send(JSON.stringify({type:'view', view:{id:'123456', version:1, match:0, seat:0, status:'lobby', spectators:0, rules:{fruits:['strawberry'],extendedPlayable:false,turnSeconds:0,spectators:false}, players:[{name:'あなた',ready:false,online:true},{name:'相手',ready:false,online:true}],game:null}}));
    else if (message.type === 'action') { actions.push(message.action); ws.send(JSON.stringify({type:'result', n:message.n})); }
  }));
  await page.goto('/game/battle/room/?id=123456');
  await page.getByRole('button', { name:'このデッキで準備OK' }).click();
  await expect.poll(() => requested).toBeGreaterThan(0);
  await expect(page.getByRole('progressbar', { name:'対戦データの準備' })).toBeVisible();
  expect(actions).toEqual([]);
  release();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0].action).toBe('ready');
});
