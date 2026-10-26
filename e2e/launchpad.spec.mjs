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
  await expect(pad.getByRole('region', { name: 'クイックリンク' }).getByRole('button')).toHaveCount(4);
  await expect(pad.getByRole('group', { name: 'ルームの操作' }).getByRole('button')).toHaveCount(3);
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

test('the game\'s screens open in the expanded pad over the same live room, without the address changing', async ({ page, browser }) => {
  const pad = await openPad(page), roomURL = page.url();
  const saved = await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('pplale-plaza-v1'));
    return { id: value.current, invite: value.rooms[value.current].invite };
  });
  const sockets = [];
  page.on('websocket', socket => sockets.push(socket.url()));
  await pad.getByRole('button', { name: 'ゲームメニューを拡大' }).click();
  // Expanded, the game's screens are down the left and the pad's tabs are icons only at the top right.
  const screens = pad.getByRole('tablist', { name: 'ゲームの画面' }), icons = pad.getByRole('tablist', { name: 'ランチパッドのタブ' });
  await expect(screens.getByRole('tab')).toHaveCount(7);
  await expect(icons.getByRole('tab')).toHaveCount(4);
  await expect(icons.getByRole('tab', { name: '設定' })).toHaveText('');
  const friend = await browser.newPage();
  await friend.goto(`${roomURL}?invite=${saved.invite}`);
  await expect(friend.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(2);
  await icons.getByRole('tab', { name: 'いまのインスタンス' }).click();
  await expect(pad.getByRole('tabpanel')).toContainText('2人');
  await pad.getByRole('button', { name: 'ランチパッドに縮小' }).click();
  await expect(screens).toHaveCount(0);
  await expect(pad.getByRole('tab', { name: 'いまのインスタンス' })).toHaveAttribute('aria-selected', 'true');
  await pad.getByRole('button', { name: 'ゲームメニューを拡大' }).click();
  // A screen, and a link inside it to another, open in the pad; the address stays the room's.
  await screens.getByRole('tab', { name: 'カード' }).click();
  await pad.getByRole('tabpanel').getByRole('link', { name: /図鑑/ }).click();
  await expect(pad.getByRole('heading', { name: 'カード図鑑' })).toBeVisible();
  await expect(page).toHaveURL(roomURL);
  await pad.getByRole('button', { name: 'もどる' }).click();
  await expect(pad.getByRole('heading', { name: 'カード', exact: true })).toBeVisible();
  await pad.getByRole('button', { name: 'メニューを閉じる' }).click();
  await expect(page.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(2);
  expect(sockets).toEqual([]);
  // An old address of a screen goes to the room with the pad open on it.
  await page.goto(`${base}/game/cpu/`);
  await page.waitForURL(roomURL, { timeout: 30000 });
  await expect(pad.getByRole('heading', { name: 'CPU対決' })).toBeVisible();
  await friend.close();
});
