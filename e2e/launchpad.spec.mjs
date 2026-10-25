import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');

async function openPad(page) {
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  return page.getByRole('dialog', { name: 'ゲームメニュー' });
}

test('five tabs switch in place, room actions and volume persist, and Escape restores the board', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const pad = await openPad(page), roomURL = page.url();
  await expect(pad.getByRole('tab')).toHaveCount(5);
  // The tabs run down the left side of the pad.
  const rail = await pad.getByRole('tablist').boundingBox(), panelBox = await pad.getByRole('tabpanel').boundingBox();
  expect(rail.x + rail.width).toBeLessThanOrEqual(panelBox.x);
  await expect(pad.getByRole('tab', { name: 'ランチパッドホーム' })).toHaveAttribute('aria-selected', 'true');
  await expect(pad.getByRole('region', { name: 'あそぶ' }).getByRole('link')).toHaveCount(4);
  await expect(pad.getByRole('region', { name: 'すぐに' }).getByRole('button')).toHaveCount(3);
  await expect(pad.getByRole('button', { name: 'CPUを呼ぶ' })).toHaveCount(0);

  await pad.getByRole('tab', { name: '通知', exact: true }).click();
  await expect(pad.getByRole('tabpanel')).toContainText('ログインすると');
  await pad.getByRole('tab', { name: '通知', exact: true }).dispatchEvent('keydown', { key: 'Escape', isComposing: true });
  await expect(pad).toBeVisible();
  await pad.getByRole('tab', { name: '通知', exact: true }).press('ArrowRight');
  await expect(pad.getByRole('tab', { name: 'いまのインスタンス' })).toBeFocused();
  await expect(pad.getByRole('tabpanel')).toContainText('作成者');
  await expect(pad.getByRole('img', { name: 'ルームのサムネイル' })).toBeVisible();
  await pad.getByRole('button', { name: 'ルーム名', exact: true }).click();
  await page.getByRole('textbox', { name: 'ルーム名' }).fill('みんなのお菓子部屋');
  await page.getByRole('button', { name: 'この名前にする' }).click();
  await expect(pad.getByRole('heading', { name: 'みんなのお菓子部屋' })).toBeVisible();
  await pad.getByRole('button', { name: 'ルール', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'ルールをかえる' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pad).toBeVisible();
  await pad.getByRole('button', { name: '共有リンク' }).click();
  await expect(page.getByRole('dialog', { name: 'ルームにさそう' })).toBeVisible();
  await page.keyboard.press('Escape');

  await pad.getByRole('tab', { name: '音量', exact: true }).click();
  const slider = pad.getByRole('slider', { name: '通知音の音量' });
  await slider.fill('37');
  await expect(slider).toHaveValue('37');
  await expect(pad.getByRole('button', { name: '音をたしかめる' })).toBeEnabled();
  await pad.getByRole('button', { name: '通知音', exact: true }).click();
  await expect(pad.getByRole('button', { name: '音をたしかめる' })).toBeDisabled();
  await pad.getByRole('tab', { name: '設定', exact: true }).click();
  await expect(pad.getByRole('tabpanel')).toContainText('アカウント');
  // The home room's visibility is kept for the next room the game opens with.
  await pad.getByRole('radio', { name: /パブリック/ }).click();
  await expect(pad.getByRole('radio', { name: /パブリック/ })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pplale-room-settings-v1')).homeVisibility)).toBe('public');
  await expect(page).toHaveURL(roomURL);
  await page.keyboard.press('Escape');
  await expect(pad).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'メニュー', exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await pad.getByRole('tab', { name: '音量', exact: true }).click();
  await expect(slider).toHaveValue('37');
  await expect(pad.getByRole('button', { name: '通知音', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('expansion uses the full game menu while keeping the same live room and board', async ({ page, browser }) => {
  const pad = await openPad(page), roomURL = page.url();
  const saved = await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('pplale-plaza-v1'));
    return { id: value.current, invite: value.rooms[value.current].invite };
  });
  const sockets = [];
  page.on('websocket', socket => sockets.push(socket.url()));
  await pad.getByRole('button', { name: 'ゲームメニューを拡大' }).click();
  await expect(pad.getByRole('navigation', { name: 'ゲームメニュー' })).toBeVisible();
  // Expanded, the game menu's tabs are on the left and this pad's tabs are icons only at the top right.
  await expect(pad.getByRole('tab')).toHaveCount(5);
  await expect(pad.getByRole('tab', { name: '設定' })).toHaveText('');
  await expect(page).toHaveURL(roomURL);
  const friend = await browser.newPage();
  await friend.goto(`${roomURL}?invite=${saved.invite}`);
  await expect(friend.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(2);
  await pad.getByRole('tab', { name: 'いまのインスタンス' }).click();
  await expect(pad.getByRole('tabpanel')).toContainText('2人');
  await pad.getByRole('button', { name: 'ランチパッドに縮小' }).click();
  await expect(pad.getByRole('navigation', { name: 'ゲームメニュー' })).toHaveCount(0);
  await expect(pad.getByRole('tab', { name: 'いまのインスタンス' })).toHaveAttribute('aria-selected', 'true');
  await pad.getByRole('button', { name: 'ゲームメニューを拡大' }).click();
  await pad.getByRole('navigation', { name: 'ゲームメニュー' }).getByRole('link', { name: /カード/ }).click();
  await page.waitForURL(/\/game\/cards\/$/);
  await expect(pad).toHaveCount(0);
  const cards = page.getByRole('dialog', { name: 'カード', exact: true });
  await cards.getByRole('navigation', { name: 'ゲームメニュー' }).getByRole('link', { name: /ホーム/ }).click();
  await expect(page).toHaveURL(roomURL);
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(2);
  expect(sockets).toEqual([]);
  await friend.close();
});
