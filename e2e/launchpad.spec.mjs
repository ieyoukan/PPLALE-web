import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');

test('the launch pad keeps frequent actions clear and secondary pages behind More', async ({ page }) => {
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const pad = page.getByRole('dialog', { name: 'ゲームメニュー' });
  await expect(pad).toBeVisible();
  await expect(pad.getByRole('heading', { name: 'ランチパッド' })).toBeVisible();
  await expect(pad.getByRole('region', { name: 'あそぶ' }).getByRole('link')).toHaveCount(4);
  await expect(pad.getByRole('region', { name: 'すぐに' }).getByRole('button')).toHaveCount(3);
  await expect(pad.getByRole('button', { name: 'ホーム', exact: true })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'CPUを呼ぶ' })).toHaveCount(0);
  await expect(pad.getByRole('link', { name: 'ひとりで' })).toHaveCount(0);
  await expect(pad.getByRole('link', { name: '対戦履歴' })).toHaveCount(0);

  await pad.getByRole('button', { name: 'もっと見る' }).click();
  await expect(pad.getByRole('navigation', { name: 'その他のページ' }).getByRole('link')).toHaveCount(3);
  await pad.getByRole('button', { name: '設定' }).click();
  await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible();
  await page.getByRole('dialog', { name: '設定' }).getByRole('button', { name: '閉じる' }).click();
  await expect(pad).toBeVisible();

  await pad.getByRole('button', { name: '新しいルーム' }).click();
  await expect(page.getByRole('dialog', { name: '新しいルームを作る' })).toBeVisible();
  await page.getByRole('dialog', { name: '新しいルームを作る' }).getByRole('button', { name: '閉じる' }).click();
  await pad.getByRole('button', { name: 'メニューを閉じる' }).click();
  await expect(pad).toHaveCount(0);
});
