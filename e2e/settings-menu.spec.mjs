import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/build');
});

test('設定をキーボードで開き、Escapeで元のボタンへ戻れる', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'メニュー', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: 'メニュー', exact: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('button', { name: '日本語', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('メニュー外へフォーカスを移すと閉じる', async ({ page }) => {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('button', { name: 'ログイン', exact: true }).focus();
  await expect(page.getByRole('region', { name: 'メニュー', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ログイン', exact: true })).toBeFocused();
});

test('狭い画面で文字を拡大しても設定と最後の操作に届く', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const panel = page.getByRole('region', { name: 'メニュー', exact: true });
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(480);
  const lastAction = panel.getByRole('button', { name: 'インポート', exact: true });
  await lastAction.scrollIntoViewIfNeeded();
  await expect(lastAction).toBeInViewport();
});
