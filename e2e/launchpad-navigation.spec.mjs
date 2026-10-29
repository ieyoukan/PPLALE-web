import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');
test.use({ reducedMotion: 'reduce' });

async function home(page) {
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  return page.getByRole('dialog', { name: 'ゲームメニュー', exact: true });
}

async function backHome(menu) {
  const shrink = menu.getByRole('button', { name: 'ランチパッドに縮小', exact: true });
  if (await shrink.isVisible()) await shrink.click();
  await menu.getByRole('tab', { name: 'ランチパッドホーム', exact: true }).click();
}

test('a fresh home launches as your room without preparation notices or a login interruption', async ({ page }, info) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/rooms', async route => { if (route.request().method() === 'POST') await gate; await route.continue(); });
  await page.goto(`${base}/game/`);
  try {
    const launch = page.getByRole('region', { name: 'ぷぷりえーる', exact: true });
    await expect(launch.getByText('あなたのルーム', { exact: true })).toBeVisible();
    await expect(launch.getByRole('img', { name: 'ルームのサムネイル' })).toBeVisible();
    await expect(launch).not.toContainText('準備しています');
    await expect(launch.getByRole('button', { name: 'Googleでログイン' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('your-home-launch.png') });
  } finally { release(); }
  await page.waitForURL(/\/game\/room\/\d{6}\/$/);
  await expect(page.getByRole('button', { name: 'この席にすわる' }).first()).toBeVisible();
});

test('resuming a room shows its actual name and thumbnail during the connection', async ({ page, request }) => {
  const made = await request.post(`${process.env.PPLALE_ROOM_SERVER_URL ?? 'http://localhost:8099'}/rooms`, { data: { name: '持ち主', rules: { fruits: ['strawberry'] }, plaza: { name: '持ち主のお茶会', visibility: 'public' } } });
  const { view, token } = await made.json(); let connection;
  await page.addInitScript(({ id, token }) => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token, at: Date.now() } } })), { id: view.id, token });
  await page.routeWebSocket(/\/rooms\/\d{6}\/socket/, socket => { connection = socket; });
  await page.goto(`${base}/game/`);
  const launch = page.getByRole('region', { name: 'ぷぷりえーる', exact: true });
  await expect(launch.getByText('持ち主のお茶会', { exact: true })).toBeVisible();
  await expect(launch.getByRole('img', { name: 'ルームのサムネイル' })).toBeVisible();
  connection.send(JSON.stringify({ type: 'view', view }));
  await page.waitForURL(`${base}/game/room/${view.id}/`);
});

test('an expired home is replaced without showing a room-not-found notice', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: '000001', rooms: { '000001': { token: 'expired', at: Date.now() } } }));
    window.launchNotices = [];
    new MutationObserver(() => {
      const text = document.body?.innerText ?? '';
      if (text.includes('ルームが見つかりませんでした') || text.includes('新しいルームを作ります')) window.launchNotices.push(text);
    }).observe(document, { subtree: true, childList: true });
  });
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/);
  expect(page.url()).not.toContain('/000001/');
  expect(await page.evaluate(() => window.launchNotices)).toEqual([]);
});

test('site providers stay out of the game; site tools preserve the room and saved preferences', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem('themeMode', 'dark'); localStorage.setItem('isTwoCardLimit', 'false');
    window.siteSettingWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'themeMode' || key === 'isTwoCardLimit') window.siteSettingWrites.push([key, value]);
      return original.call(this, key, value);
    };
  });
  const menu = await home(page), roomURL = page.url();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => window.siteSettingWrites)).toEqual([]);
  await menu.getByRole('button', { name: 'カード', exact: true }).click();
  for (const name of [/^デッキ構築/, /^2Pick構築/, /^デッキ画像/]) await expect(menu.getByRole('link', { name })).toHaveAttribute('target', '_blank');
  const popupPromise = page.waitForEvent('popup');
  await menu.getByRole('link', { name: /^デッキ構築/ }).click();
  const site = await popupPromise;
  try {
    await expect(site.locator('html')).toHaveClass(/\bdark\b/);
    await expect.poll(() => site.evaluate(() => localStorage.getItem('isTwoCardLimit'))).toBe('false');
    await expect(page).toHaveURL(roomURL);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await site.locator('header a[href="/"]').first().click();
    await expect(site).toHaveURL(`${base}/`);
    await expect(site.locator('html')).not.toHaveClass(/\bdark\b/);
    await site.locator('a[href^="/privacy-policy"]').first().click();
    await expect(site.locator('html')).toHaveClass(/\bdark\b/);
    await site.locator('a[href="/"]').first().click();
    await expect(site.locator('html')).not.toHaveClass(/\bdark\b/);
    await site.locator('a[href="/game/"]').first().click();
    await site.waitForURL(/\/game\/room\/\d{6}\/$/);
    await expect(site.locator('html')).not.toHaveClass(/\bdark\b/);
    expect(await site.evaluate(() => localStorage.getItem('themeMode'))).toBe('dark');
  } finally { await site.close(); }
});

for (const width of [1280, 390]) test(`launchpad exposes game tools with matching tiles and keeps the room (${width}px)`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const menu = await home(page), roomURL = page.url();
  const links = menu.getByRole('navigation', { name: 'ゲームの画面', exact: true });
  await expect(links.getByRole('button')).toHaveText(['ソーシャル', 'ルーム', 'カード', 'リーサルパズル', '対戦履歴', '盤面エディタ']);
  const sizes = await links.getByRole('button').evaluateAll(buttons => buttons.map(button => [button.offsetWidth, button.offsetHeight]));
  expect(new Set(sizes.map(size => JSON.stringify(size))).size).toBe(1);
  await expect(menu.getByText('フリーマッチ', { exact: true })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'もっと見る', exact: true })).toHaveCount(0);
  for (const label of ['プロフィール', '通信計測']) await expect(menu.getByRole('button', { name: label, exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('destinations.png') });
  await links.getByRole('button', { name: '盤面エディタ', exact: true }).click();
  await expect(menu.getByRole('heading', { name: '盤面エディタ', exact: true }).first()).toBeVisible();
  await backHome(menu);
  await menu.getByRole('button', { name: '通信計測', exact: true }).click();
  await expect(menu.getByRole('heading', { name: '通信計測', exact: true }).first()).toBeVisible();
  await backHome(menu);
  await menu.getByRole('button', { name: 'プロフィール', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeVisible();
  await expect(page).toHaveURL(roomURL);
});

test('a numeric room id is reachable from the room browser; the retired free URL returns to the room', async ({ page, request }) => {
  const made = await request.post(`${process.env.PPLALE_ROOM_SERVER_URL ?? 'http://localhost:8099'}/rooms`, { data: { name: '招待した人', rules: { fruits: ['strawberry'] }, plaza: { name: 'IDで見つかるルーム', visibility: 'public' } } });
  const { view } = await made.json();
  const menu = await home(page);
  await menu.getByRole('button', { name: 'ルーム', exact: true }).click();
  await menu.getByRole('button', { name: 'IDで入る', exact: true }).click();
  const form = menu.getByRole('form', { name: 'ルームIDで入る' });
  await expect(form.getByRole('button', { name: '入る', exact: true })).toBeDisabled();
  await form.getByRole('textbox', { name: 'ルームID', exact: true }).fill(view.id);
  await form.getByRole('button', { name: '入る', exact: true }).click();
  await expect(page).toHaveURL(`${base}/game/room/${view.id}/`);
  await expect(page.getByRole('button', { name: /IDで見つかるルーム.*のメニュー/ })).toBeVisible();
  await page.goto(`${base}/game/battle/free/`);
  await expect(page).toHaveURL(`${base}/game/room/${view.id}/`);
  await expect(page.getByRole('button', { name: 'このデッキで対戦相手を探す' })).toHaveCount(0);
});
