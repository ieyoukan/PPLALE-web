import { test, expect, chromium } from '@playwright/test';
import sharp from 'sharp';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');

async function openRoom(page, seated = false) {
  const id = '123456', messages = [];
  const view = { id, version: 1, status: 'lobby', match: 0, seat: 0, spectators: 0,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true },
    players: seated ? [{ member: 'me', name: 'あなた', online: true, ready: false }, null] : [null, null], game: null, last: null, resigned: null,
    plaza: { name: 'ゲストのルーム', visibility: 'invite', me: 'me', owner: 'me', creator: { name: 'あなた' }, invite: 'test-secret',
      members: [{ id: 'me', name: 'あなた', online: true }, { id: 'other', name: 'ほかのゲスト', online: true }] },
  };
  await page.addInitScript(id => {
    localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } }));
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.copied.push(text) } });
  }, id);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, socket => socket.onMessage(bytes => {
    const message = JSON.parse(String(bytes)); messages.push(message);
    if (message.type === 'hello') socket.send(JSON.stringify({ type: 'view', view }));
    if (message.type === 'action') socket.send(JSON.stringify({ type: 'result', n: message.n }));
  }));
  await page.goto(`${base}/game/room/${id}/`);
  await expect(page.locator('[data-room-camera="lobby"]')).toBeVisible();
  return messages;
}

for (const entry of ['roster', 'seat', 'instance']) test(`guests open their own profile from ${entry} without leaving the room`, async ({ page }) => {
  const messages = await openRoom(page, entry === 'seat'), url = page.url();
  if (entry === 'instance') {
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'ゲームメニュー', exact: true });
    await menu.getByRole('tab', { name: 'いまのルーム', exact: true }).click();
    await expect(menu.getByRole('region', { name: 'ほかの人', exact: true }).getByRole('link')).toHaveCount(0);
    await menu.getByRole('region', { name: 'あなた', exact: true }).getByRole('link', { name: '自分のプロフィール' }).click();
  } else {
    const area = entry === 'seat' ? page.locator('[data-self]') : page.getByRole('complementary', { name: 'ルームにいる人' });
    const own = area.getByRole('link', { name: '自分のプロフィール' });
    await expect(own).toHaveAttribute('href', '/game/profile/');
    await own.click();
  }
  await expect(page.getByRole('region', { name: 'プロフィールにログイン' })).toContainText('プロフィールを使うにはログインしてください');
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  await expect(page).toHaveURL(url);
  expect(messages.filter(message => message.type === 'hello')).toHaveLength(1);
  expect(messages.some(message => message.action?.action === 'leave')).toBe(false);
});

const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
const luminance = channels => channels.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
for (const colorScheme of ['light', 'dark']) for (const width of [1280, 390]) test(`Discord copy stays readable inside the launchpad (${colorScheme}, ${width}px)`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ colorScheme });
  await openRoom(page);
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('dialog', { name: 'ゲームメニュー', exact: true }).getByRole('button', { name: 'さそう', exact: true }).click();
  const share = page.getByRole('dialog', { name: 'ルームにさそう', exact: true });
  const button = share.getByRole('button', { name: /Discordに貼る/ });
  const colours = await button.evaluate(element => ({ text: getComputedStyle(element.querySelector('b')).color, face: getComputedStyle(element, '::before').backgroundColor }));
  const a = luminance(rgb(colours.text)), b = luminance(rgb(colours.face));
  expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
  await button.click();
  await expect(share.getByRole('status')).toContainText('Discordに貼るメッセージをコピーしました');
  expect((await page.evaluate(() => window.copied[0]))).toContain('/game/room/123456/?invite=test-secret');
  await page.screenshot({ path: info.outputPath('discord-copy.png') });
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await button.click();
  await expect(share.getByRole('alert')).toHaveText('コピーできませんでした');
});

for (const software of [false, true]) test(`wooden geometry never changes board pixels (${software ? 'software' : 'default'})`, async ({ browser }, info) => {
    const testBrowser = software ? await chromium.launch({ args: ['--disable-gpu'] }) : browser;
    const context = await testBrowser.newContext(), page = await context.newPage();
    try {
    await page.setViewportSize({ width: 1280, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRoom(page);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-room-board-projection] img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const points = await page.locator('[data-room-board-projection] section > div:last-child > span').evaluateAll(slots => slots.map(slot => {
      const r = slot.getBoundingClientRect(); return { left: Math.round(r.x + r.width / 2) - 2, top: Math.round(r.y + r.height / 2) - 2, width: 4, height: 4 };
    }));
    expect(points).toHaveLength(14);
    const before = await page.screenshot({ path: info.outputPath('preparation.png'), animations: 'disabled' });
    await page.locator('[data-room-floor]').evaluate(floor => { floor.parentElement.style.visibility = 'hidden'; });
    const after = await page.screenshot({ animations: 'disabled' });
    for (const point of points) {
      const a = await sharp(before).extract(point).raw().toBuffer(), b = await sharp(after).extract(point).raw().toBuffer();
      expect(a.equals(b)).toBe(true);
    }
    } finally { await context.close(); if (software) await testBrowser.close(); }
});

test('one room editor saves a name without resetting preparation; roster marks and control radii stay aligned', async ({ page }, info) => {
  const messages = await openRoom(page, true);
  await expect(page.getByRole('button', { name: 'ルーム名を変える', exact: true })).toHaveCount(0);
  const roster = page.getByRole('complementary', { name: 'ルームにいる人' });
  const overflow = await roster.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('[role="img"]')].some(mark => { const box = mark.getBoundingClientRect(); return box.right > bounds.right - 8 || box.left < bounds.left; });
  });
  expect(overflow).toBe(false);
  const small = await page.getByRole('button', { name: 'メニュー', exact: true }).evaluate(element => getComputedStyle(element).borderRadius);
  const large = await page.getByRole('button', { name: 'ルール', exact: true }).evaluate(element => getComputedStyle(element).borderRadius);
  expect(large).toBe(small);
  await page.getByRole('button', { name: 'ルール', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'ルームを編集', exact: true });
  await editor.getByRole('textbox', { name: 'ルーム名', exact: true }).fill('お菓子の会');
  await page.screenshot({ path: info.outputPath('room-editor.png') });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(messages.filter(message => message.type === 'action').map(message => message.action)).toEqual([{ action: 'rename', name: 'お菓子の会' }]);
});
