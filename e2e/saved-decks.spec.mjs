import { test, expect } from '@playwright/test';
import { openSavedDeckList } from './fixtures/savedDeckHarness.mjs';

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 720 }); });

test('initial grid and controls do not wait for previews or OGP generation', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.route('**/deck-thumbnails/**', route => route.abort());
  await openSavedDeckList(page, { delay: 200 });
  await expect(page.getByRole('heading', { name: 'デッキ 00', exact: true })).toBeVisible();
  await expect(page.locator('li')).toHaveCount(12);
  await expect(page.getByLabel('並び順')).toBeEnabled();
  expect(requests.some(url => url.includes('/api/og/') || url.includes('/_next/image'))).toBe(false);
  expect(await page.locator('svg image').first().getAttribute('href')).toContain('/deck-thumbnails/');
  expect(await page.locator('li a').first().getAttribute('data-prefetch')).toBe('false');
  expect(await page.evaluate(() => window.__decks.reads.length)).toBe(1);
});

test('scrolling loads every page without duplicate decks', async ({ page }) => {
  await openSavedDeckList(page);
  await expect(page.locator('li')).toHaveCount(12);
  for (const count of [24, 31]) {
    await page.getByRole('button', { name: 'さらに読み込む' }).scrollIntoViewIfNeeded();
    await expect(page.locator('li')).toHaveCount(count);
  }
  await expect(page.getByText('すべてのデッキを表示しました', { exact: true })).toBeVisible();
  expect(new Set(await page.locator('li a').evaluateAll(links => links.map(link => link.href))).size).toBe(31);
});

test('search finds an older deck and combines exact fruits and playable filters', async ({ page }) => {
  await openSavedDeckList(page);
  await page.getByLabel('デッキ名でフィルター', { exact: true }).fill('オレンジ');
  await page.getByRole('checkbox', { name: 'おれんじ', exact: true }).check();
  await page.getByRole('combobox', { name: 'プレイアブルカード', exact: true }).selectOption('p_0');
  await expect(page.getByRole('combobox', { name: '構築方法', exact: true })).toHaveCount(0);
  await expect(page.locator('li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '古いオレンジのデッキ' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'いちご', exact: true }).check();
  await expect(page.getByText('条件に合うデッキがありません', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '条件をリセット' }).click();
  await expect(page.locator('li')).toHaveCount(12);
});

test('fruit combinations match exactly, including fruits from sweets', async ({ page }) => {
  const base = { updatedAt: 1700000000000, playableCardId: null };
  const decks = [
    { ...base, id: 'mono', name: 'いちご単色', yojoDeckIds: ['y_0'], sweetDeckIds: ['s_0'] },
    { ...base, id: 'mixed', name: 'いちごとぶどう', yojoDeckIds: ['y_0', 'y_31'], sweetDeckIds: ['s_0'] },
    { ...base, id: 'sweet-mixed', name: 'お菓子にぶどう', yojoDeckIds: ['y_0'], sweetDeckIds: ['s_28'] },
    { ...base, id: 'triple', name: '三色デッキ', yojoDeckIds: ['y_0', 'y_31', 'y_65'], sweetDeckIds: ['s_0'] },
    { ...base, id: 'grape', name: 'ぶどう単色', yojoDeckIds: ['y_31'], sweetDeckIds: ['s_28'] },
    { ...base, id: 'empty', name: '空のデッキ', yojoDeckIds: [], sweetDeckIds: [] },
  ];
  await openSavedDeckList(page, { decks });
  await expect(page.locator('li')).toHaveCount(6);
  await page.getByRole('checkbox', { name: 'いちご', exact: true }).check();
  await expect(page.locator('li h3')).toHaveText(['いちご単色']);
  await page.getByRole('checkbox', { name: 'ぶどう', exact: true }).check();
  await expect(page.locator('li')).toHaveCount(2);
  expect(new Set(await page.locator('li h3').allTextContents())).toEqual(new Set(['いちごとぶどう', 'お菓子にぶどう']));
  await page.getByRole('checkbox', { name: 'いちご', exact: true }).uncheck();
  await expect(page.locator('li h3')).toHaveText(['ぶどう単色']);
  await page.getByRole('checkbox', { name: 'ぶどう', exact: true }).uncheck();
  await expect(page.locator('li')).toHaveCount(6);
  await page.getByRole('checkbox', { name: 'めろん', exact: true }).check();
  await expect(page.getByText('条件に合うデッキがありません', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'すべて', exact: true }).click();
  await expect(page.locator('li')).toHaveCount(6);
  await expect(page.getByRole('checkbox', { name: 'めろん', exact: true })).not.toBeChecked();
});

test('global sort includes records beyond the first page', async ({ page }) => {
  await openSavedDeckList(page);
  await page.getByLabel('並び順').selectOption('updated-asc');
  await expect(page.locator('li h3').first()).toHaveText('古いオレンジのデッキ');
  await page.getByLabel('並び順').selectOption('name-desc');
  await expect(page.locator('li h3').first()).toHaveText('古いオレンジのデッキ');
  await page.getByLabel('並び順').selectOption('name-asc');
  await expect(page.locator('li h3').first()).toHaveText('デッキ 00');
});

test('failed initial read can be retried', async ({ page }) => {
  await openSavedDeckList(page, { failNext: true });
  await expect(page.getByRole('alert')).toHaveText('デッキを読み込めませんでした');
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.getByRole('heading', { name: 'デッキ 00', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('delete confirmation supports cancellation and removes only the selected deck', async ({ page }) => {
  await openSavedDeckList(page);
  await page.locator('li').first().getByRole('button', { name: /デッキを削除/ }).click();
  const dialog = page.getByRole('dialog', { name: 'デッキの削除', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.locator('li')).toHaveCount(12);
  await page.locator('li').first().getByRole('button', { name: /デッキを削除/ }).click();
  await dialog.getByRole('button', { name: '削除する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'デッキ 00', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__decks.deleted)).toEqual(['deck-0']);
});

test('mobile grid fits the viewport and filters remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSavedDeckList(page);
  await expect(page.getByRole('heading', { name: 'デッキ 00', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('デッキ名でフィルター', { exact: true }).fill('オレンジ');
  await expect(page.getByRole('heading', { name: '古いオレンジのデッキ' })).toBeVisible();
});

test('English list uses translated controls and prebuilt English thumbnails', async ({ page }) => {
  await openSavedDeckList(page, { locale: 'en' });
  await expect(page.getByRole('heading', { name: 'Your decks', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Sort by', exact: true })).toBeEnabled();
  await expect(page.locator('svg image').first()).toHaveAttribute('href', /\/deck-thumbnails\/en\//);
});

test('sharing copies the selected deck URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSavedDeckList(page);
  await page.locator('li').first().getByRole('button', { name: /共有リンクをコピー/ }).click();
  await expect(page.getByText('共有リンクをコピーしました', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('http://localhost:3000/deck/fixture-user/deck-0');
});

test('real build page renders creation controls without generating OGP', async ({ page }) => {
  const errors = [], ogRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/og/')) ogRequests.push(request.url()); });
  await page.goto('/build/');
  await expect(page.getByRole('heading', { name: /^(新しいデッキを作成|Create a new deck)$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /通常構築|Standard deck/ }).first()).toBeEnabled();
  expect(ogRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('real OGP API rejects unsigned and invalid requests without caching errors', async ({ request }) => {
  for (const [userId, expectedStatus] of [['fixture-user', 401], ['x'.repeat(65), 400]]) {
    const response = await request.get(`/api/og/${userId}/fixture-deck/`);
    expect(response.status()).toBe(expectedStatus);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
});
