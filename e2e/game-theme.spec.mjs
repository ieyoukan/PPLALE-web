import { test, expect } from '@playwright/test';
const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');

for (const theme of ['light', 'dark']) test(`game labels and native selects stay readable in ${theme} mode`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(value => localStorage.setItem('themeMode', value), theme);
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(theme === 'dark');
  await page.getByRole('button', { name: 'ルール', exact: true }).click();
  const rules = page.getByRole('dialog', { name: 'ルールをかえる' });
  const labels = await rules.locator('label, legend').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(color => color === 'rgb(99, 71, 71)')).toBe(true);
  await rules.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ルーム名を変える', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'ルーム名', exact: true })).toHaveCSS('color', 'rgb(99, 71, 71)');
  expect(await page.locator('label[for="plaza-room-name"]').evaluate(element => getComputedStyle(element).color)).toBe('rgb(120, 88, 88)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('tab', { name: '設定', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'ホームルームの公開範囲' });
  await expect(select).toHaveCSS('color', 'rgb(99, 71, 71)');
  await expect(select.getByRole('option').first()).toHaveCSS('color', 'rgb(123, 94, 88)');
  await expect(select.getByRole('option').first()).toHaveCSS('background-color', 'rgb(255, 248, 240)');
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(theme === 'dark');
});
