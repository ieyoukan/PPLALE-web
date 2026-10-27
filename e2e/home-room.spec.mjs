import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');
test.use({ reducedMotion: 'reduce' });

async function start(page) {
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'この席にすわる', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  return page.getByRole('dialog', { name: 'ゲームメニュー', exact: true });
}
const confirmation = page => page.getByRole('dialog', { name: 'ホームへ移動しますか？', exact: true });

test('home confirms a fresh room with saved visibility and leaves other people in the old room', async ({ page, browser }, info) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const pad = await start(page), original = page.url();
  const saved = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('pplale-plaza-v1'));
    return { id: data.current, invite: data.rooms[data.current].invite };
  });
  const friendContext = await browser.newContext();
  try {
    const friend = await friendContext.newPage();
    await friend.goto(`${original}?invite=${saved.invite}`);
    await friend.waitForURL(original);
    await expect(friend.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(2);
    await pad.getByRole('tab', { name: '設定', exact: true }).click();
    await pad.getByRole('combobox', { name: 'ホームルームの公開範囲', exact: true }).selectOption('public');
    await pad.getByRole('tab', { name: 'ランチパッドホーム', exact: true }).click();
    let creations = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/rooms') creations++; });
    for (const dismiss of ['キャンセル', 'Escape', '閉じる']) {
      await pad.getByRole('button', { name: 'ホーム', exact: true }).click();
      await expect(confirmation(page)).toContainText('パブリック');
      await expect(confirmation(page)).toContainText('このルームのオーナーがいなくなります');
      await expect(confirmation(page)).not.toContainText('対戦中の試合は負けになります');
      if (dismiss === 'Escape') await page.keyboard.press('Escape');
      else await confirmation(page).getByRole('button', { name: dismiss, exact: true }).click();
      await expect(confirmation(page)).toHaveCount(0);
      await expect(page).toHaveURL(original);
      expect(creations).toBe(0);
    }
    await pad.getByRole('button', { name: 'ホーム', exact: true }).click();
    await page.screenshot({ path: info.outputPath('home-confirmation.png') });
    await confirmation(page).getByRole('button', { name: '移動する', exact: true }).click();
    await page.waitForURL(url => /^\/game\/room\/\d{6}\/$/.test(url.pathname) && url.href !== original);
    expect(creations).toBe(1);
    await expect(pad).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'ルームを作りました', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /のメニュー$/ })).toContainText('パブリック');
    await expect(page.getByRole('button', { name: 'この席にすわる', exact: true })).toHaveCount(2);
    await expect(friend).toHaveURL(original);
    await expect(friend.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(1);
    await expect(friend.getByRole('button', { name: 'オーナーになる', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await friendContext.close(); }
});

test('failed home creation keeps the room and allows a single retry', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const pad = await start(page), original = page.url();
  let fail = true, creations = 0;
  await page.route('**/rooms', async route => {
    creations++;
    if (fail) await route.fulfill({ status: 503, json: { error: '作成の接続テスト' } });
    else await route.continue();
  });
  await pad.getByRole('button', { name: 'ホーム', exact: true }).click();
  const move = confirmation(page).getByRole('button', { name: '移動する', exact: true });
  await move.click();
  await expect(confirmation(page).getByRole('alert')).toContainText('ホームルームを作れませんでした');
  await expect(page).toHaveURL(original);
  expect(creations).toBe(1);
  fail = false;
  await move.evaluate(button => { button.click(); button.click(); });
  await page.waitForURL(url => /^\/game\/room\/\d{6}\/$/.test(url.pathname) && url.href !== original);
  expect(creations).toBe(2);
  await expect(page.getByRole('button', { name: /のメニュー$/ })).toContainText('インバイト');
  expect(errors).toEqual([]);
});
