// Run against the same local app + room server as room-match.spec.mjs.
import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');

test('free match: cancel, meet automatically, reload and find the next opponent', async ({ browser }) => {
  test.setTimeout(90000);
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const first = await desktop.newPage(), second = await mobile.newPage();
  const errors = [];
  for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
  try {
    await first.goto(`${base}/game/battle/`);
    await first.getByRole('link', { name: /フリーマッチ 対戦相手を自動で探す/ }).click();
    await expect(first.getByRole('heading', { name: 'フリーマッチ', exact: true })).toBeVisible();
    await first.getByPlaceholder('なまえ').fill('ふりーA');
    await first.getByRole('button', { name: 'このデッキで対戦相手を探す' }).click();
    await expect(first.getByText('対戦相手を探しています…', { exact: true })).toBeVisible();
    await first.getByRole('button', { name: '検索をキャンセル', exact: true }).click();
    await expect(first.getByRole('button', { name: 'このデッキで対戦相手を探す' })).toBeVisible();

    await second.goto(`${base}/game/battle/free/`);
    await second.getByPlaceholder('なまえ').fill('ふりーB');
    expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await first.getByRole('button', { name: 'このデッキで対戦相手を探す' }).click();
    await expect(first.getByText('対戦相手を探しています…', { exact: true })).toBeVisible();
    await second.getByRole('button', { name: 'このデッキで対戦相手を探す' }).click();
    for (const page of [first, second]) await expect(page).toHaveURL(/\/game\/room\/\?id=\d{6}/, { timeout: 15000 });
    expect(new URL(first.url()).searchParams.get('id')).toBe(new URL(second.url()).searchParams.get('id'));
    await expect(first.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    await second.reload();
    // Seat 1 waits for seat 0's roll, so its die is not interactive yet.
    await expect(second.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    await second.getByRole('button', { name: 'メニュー', exact: true }).click();
    await second.getByRole('button', { name: '投了する', exact: true }).click();
    await second.getByRole('button', { name: /投了する（/ }).click();
    for (const page of [first, second]) await expect(page.getByRole('dialog', { name: '対戦結果' })).toBeVisible({ timeout: 20000 });
    await first.getByRole('button', { name: '次の相手を探す' }).click();
    await first.waitForURL(/\/game\/battle\/free\//);
    await expect(first.getByRole('button', { name: 'このデッキで対戦相手を探す' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
