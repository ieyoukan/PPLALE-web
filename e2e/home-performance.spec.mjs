import { test, expect } from '@playwright/test';

test('home prioritizes the logo and starts auth only when a game consumer appears', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const logo = page.getByRole('img', { name: 'お菓子争奪戦争ぷぷりえーる', exact: true });
  await expect(logo).toHaveAttribute('loading', 'eager');
  await expect(logo).toHaveAttribute('fetchpriority', 'high');
  expect(await page.evaluate(() => !!globalThis.pplaleAuth)).toBe(false);

  await page.getByRole('navigation', { name: 'メニュー', exact: true }).getByRole('link', { name: 'ゲームをプレイ', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'ゲームメニュー', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!globalThis.pplaleAuth)).toBe(true);
  await page.evaluate(() => { globalThis.__startedAuth = globalThis.pplaleAuth; });
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  expect(await page.evaluate(() => !!globalThis.pplaleAuth && globalThis.__startedAuth === globalThis.pplaleAuth)).toBe(true);
  expect(failures).toEqual([]);
});

test('card pickup loads on demand and opens details', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: '山札からカードをピックアップする', exact: true });
  await button.click();
  const list = page.getByRole('list', { name: 'ピックアップしたカード', exact: true });
  await expect.poll(() => list.getByRole('listitem').count()).toBeGreaterThanOrEqual(3);
  expect(await list.getByRole('listitem').count()).toBeLessThanOrEqual(4);
  await expect(page.getByRole('button', { name: '山札からカードをもう一度引く', exact: true })).toBeEnabled();
  await list.getByRole('listitem').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
