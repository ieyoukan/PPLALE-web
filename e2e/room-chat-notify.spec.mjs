import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server');
const chatButton = page => page.getByRole('button', { name: 'ルームチャット', exact: true });
const input = page => page.getByRole('textbox', { name: 'メッセージ', exact: true });
const log = page => page.getByRole('log', { name: 'チャットのメッセージ' });
const hideDevTools = page => page.addStyleTag({ content: 'nextjs-portal { display: none; }' });

test('a new message shows a bubble and a red badge to a closed chat, and 既読 once it is read', async ({ page, browser }, info) => {
  test.setTimeout(90000);
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/);
  await hideDevTools(page);
  const roomURL = page.url();
  const invite = await page.evaluate(() => { const saved = JSON.parse(localStorage.getItem('pplale-plaza-v1')); return saved.rooms[saved.current].invite; });
  const context = await browser.newContext();
  try {
    const friend = await context.newPage();
    await friend.goto(`${roomURL}?invite=${invite}`);
    await hideDevTools(friend);
    await expect(chatButton(friend)).toBeVisible();
    await page.keyboard.press('t');
    await input(page).fill('いっしょにあそぼ'); await input(page).press('Enter');
    await expect(input(page)).toHaveValue('');
    // The friend's chat is closed: the message comes up beside the button, with a red count.
    const bubble = friend.getByRole('button', { name: /の新しいメッセージ。チャットを開く$/ });
    await expect(bubble).toContainText('いっしょにあそぼ');
    const badge = friend.getByRole('status', { name: '未読1件' });
    await expect(badge).toBeVisible();
    expect(await badge.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(217, 58, 79)');
    await friend.screenshot({ path: info.outputPath('bubble.png') });
    // Nobody has read it yet; the friend opens the chat from the bubble, and the sender sees 既読.
    await expect(log(page)).not.toContainText('既読');
    await bubble.click();
    await expect(log(friend)).toContainText('いっしょにあそぼ');
    await expect(badge).toHaveCount(0);
    await expect(log(page)).toContainText('既読');
    await page.screenshot({ path: info.outputPath('read.png') });
    // The bubble fades away by itself.
    await friend.keyboard.press('Escape');
    await page.waitForTimeout(1100);
    await input(page).fill('まだいる？'); await input(page).press('Enter');
    await expect(friend.getByRole('button', { name: /の新しいメッセージ/ })).toContainText('まだいる？');
    await expect(friend.getByRole('button', { name: /の新しいメッセージ/ })).toHaveCount(0, { timeout: 8000 });
  } finally { await context.close(); }
});
