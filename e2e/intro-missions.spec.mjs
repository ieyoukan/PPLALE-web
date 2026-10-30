import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });
const progressKey = 'pplale-lethal-cleared-v1';
const endTurn = page => page.getByRole('button', { name: /ターン\s*終了/ });
const badge = page => page.getByRole('link', { name: '初心者ミッション', exact: true });
const unit = (page, side, uid) => page.locator(`[data-side="${side}"][data-unit="${uid}"]`);
const result = page => page.getByRole('dialog', { name: 'パズルクリア', exact: true });
const hideDevTools = page => page.addStyleTag({ content: 'nextjs-portal { display: none; }' });

async function summon(page, uid) {
  await expect(endTurn(page)).toBeEnabled();
  await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
  await page.getByRole('button', { name: '場に出す', exact: true }).click();
}

async function attack(page, uid, target) {
  await expect(endTurn(page)).toBeEnabled();
  await unit(page, 0, uid).click();
  if (target === 'leader') await page.locator('[data-leader="1"]').getByRole('button', { name: /^お菓子ポイント \d+$/ }).click();
  else await unit(page, 1, target).click();
}

test('room mission starts the lesson, saves a real clear and resumes after reload', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/game/'); await page.waitForURL(/\/game\/room\/\d{6}\//); await hideDevTools(page);
  const room = page.url();
  await badge(page).click();
  await expect(page.getByRole('heading', { name: '入門編をクリアする', exact: true })).toBeVisible();
  const progress = page.getByRole('progressbar', { name: '入門編のクリア状況', exact: true });
  await expect(progress).toHaveAttribute('value', '0');
  await page.screenshot({ path: info.outputPath('beginner-missions.png') });
  await page.getByRole('link', { name: 'はじめる', exact: true }).click();
  const lesson = page.getByRole('dialog', { name: '召喚酔いと突撃と防衛', exact: true });
  await expect(lesson).toBeVisible(); await expect(lesson).toContainText('召喚酔い');
  await page.screenshot({ path: info.outputPath('intro-lesson.png') });
  await lesson.getByRole('button', { name: '挑戦する', exact: true }).click();
  await summon(page, 'c2'); await attack(page, 'c2', 'c8');
  const deck = page.locator('[data-deck="0-yojo"]');
  await expect(deck).toBeEnabled(); await deck.click();
  await attack(page, 'c3', 'leader');
  await expect(result(page)).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey)).toEqual(['intro-1']);
  await result(page).getByRole('button', { name: '問題一覧へ', exact: true }).click();
  await expect(page).toHaveURL(room);
  await expect(page.getByRole('link', { name: /入門①.*クリア済み/ })).toBeVisible();
  await page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
  await badge(page).click(); await expect(progress).toHaveAttribute('value', '1');
  await expect(page.getByRole('link', { name: 'つづきから', exact: true })).toHaveAttribute('href', '/game/puzzle/?id=intro-2');
  await page.reload(); await hideDevTools(page); await badge(page).click();
  await expect(progress).toHaveAttribute('value', '1');
});

test('finishing the fifth lesson completes the mission and removes the room marker', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(key => { if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(['intro-1', 'intro-2', 'intro-3', 'intro-4'])); }, progressKey);
  await page.goto('/game/'); await page.waitForURL(/\/game\/room\/\d{6}\//); await hideDevTools(page);
  const room = page.url();
  await badge(page).click();
  await expect(page.getByRole('progressbar', { name: '入門編のクリア状況' })).toHaveAttribute('value', '4');
  await page.getByRole('link', { name: 'つづきから', exact: true }).click();
  await page.getByRole('dialog', { name: '貫通で相手の防衛を無視しよう' }).getByRole('button', { name: '挑戦する', exact: true }).click();
  await summon(page, 'c1'); await attack(page, 'c1', 'leader');
  await expect(result(page)).toContainText('初心者ミッション達成');
  await result(page).getByRole('button', { name: '初心者ミッションへ', exact: true }).click();
  await expect(page).toHaveURL(room);
  await expect(page.getByRole('status').filter({ hasText: 'ミッション達成！' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '入門編のクリア状況' })).toHaveAttribute('value', '5');
  await page.screenshot({ path: info.outputPath('mission-complete.png') });
  await page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
  await expect(badge(page)).toHaveCount(0);
  // 同じタブ内の初期化スクリプトで進捗を戻さずに、保存済みの状態を再読み込みする。
  await page.evaluate(() => location.reload());
  await expect(page.getByRole('button', { name: 'メニュー', exact: true })).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
});

test('a failed attempt earns no progress and clearing only the last lesson is not full completion', async ({ page }) => {
  await page.goto('/game/puzzle/?id=intro-5'); await hideDevTools(page);
  await page.getByRole('dialog', { name: '貫通で相手の防衛を無視しよう' }).getByRole('button', { name: '挑戦する', exact: true }).click();
  await expect(endTurn(page)).toBeEnabled(); await endTurn(page).click();
  const failure = page.getByRole('dialog', { name: 'もう一度挑戦', exact: true });
  await expect(failure).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), progressKey)).toBeNull();
  await failure.getByRole('button', { name: '一手戻す', exact: true }).click();
  await summon(page, 'c1'); await attack(page, 'c1', 'leader');
  await expect(result(page)).toContainText('残りの入門問題');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey)).toEqual(['intro-5']);
  await result(page).getByRole('button', { name: '初心者ミッションへ', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '入門編のクリア状況' })).toHaveAttribute('value', '1');
  await expect(page.getByRole('link', { name: 'つづきから', exact: true })).toHaveAttribute('href', '/game/puzzle/?id=intro-1');
});
