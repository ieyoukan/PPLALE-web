import { test, expect } from '@playwright/test';

test('home uses three small fonts and fetches additional kanji only when needed', async ({ page }) => {
  const fonts = new Map();
  page.on('response', response => {
    if (response.url().includes('/fonts/generated/')) fonts.set(response.url(), response);
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  expect(fonts.size).toBe(3);
  expect([...fonts.keys()].every(url => url.includes('-home-'))).toBe(true);
  let bytes = 0;
  for (const response of fonts.values()) {
    expect(response.ok()).toBe(true);
    bytes += (await response.body()).length;
  }
  expect(bytes).toBeLessThan(120_000);
  const headingFamily = await page.locator('#game-introduction-heading').evaluate(el => getComputedStyle(el).fontFamily);
  expect(headingFamily).toContain('Mochiy Pop One');
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Zen Maru Gothic');

  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 20px "Mochiy Pop One"', '龍鬱鯨'),
      document.fonts.load('500 20px "Zen Maru Gothic"', '龍鬱鯨'),
      document.fonts.load('700 20px "Zen Maru Gothic"', '龍鬱鯨'),
    ]);
  });
  const extra = [...fonts.entries()].filter(([url]) => !url.includes('-home-'));
  expect(extra.length).toBeGreaterThan(0);
  for (const [, response] of extra) expect(response.ok()).toBe(true);
});
