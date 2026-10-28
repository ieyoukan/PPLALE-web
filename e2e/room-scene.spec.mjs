import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');

async function openRoom(page) {
  const id = '123456';
  const view = { id, version: 1, status: 'lobby', match: 0, seat: 0, spectators: 0,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, players: [null, null], game: null, last: null, resigned: null,
    plaza: { name: '星空のお菓子ルーム', visibility: 'invite', me: 'me', owner: 'me', creator: { name: 'あなた' },
      members: [{ id: 'me', name: 'あなた', online: true }], invite: 'test-invite' },
  };
  const messages = [];
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, socket => socket.onMessage(bytes => {
    const message = JSON.parse(String(bytes)); messages.push(message);
    if (message.type === 'hello') socket.send(JSON.stringify({ type: 'view', view }));
    if (message.type === 'action') socket.send(JSON.stringify({ type: 'result', n: message.n }));
  }));
  await page.goto(`${base}/game/room/${id}/`);
  await expect(page.locator('[data-room-scene]')).toBeVisible();
  return messages;
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
  test(`starry room keeps both seats and rules usable at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const messages = await openRoom(page);
    const sky = await page.evaluate(async () => {
      const image = new Image(); image.src = '/images/game/room-stars.webp'; await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    });
    expect(sky.width / sky.height).toBe(1.75);
    const floor = await page.locator('[data-room-floor]').evaluate(element => getComputedStyle(element).backgroundImage);
    expect(floor).toContain('gradient');
    const seats = page.getByRole('button', { name: 'この席にすわる' });
    await expect(seats).toHaveCount(2);
    for (const seat of await seats.all()) {
      await expect(seat).toBeInViewport();
      await seat.click({ trial: true });
    }
    await page.getByRole('button', { name: 'ルール', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'ルールをかえる', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: info.outputPath('starry-room.png') });
    const side = viewport.width === 1280 ? 0 : 1;
    await seats.nth(side).click();
    await expect.poll(() => messages.some(message => message.type === 'action' && message.action.action === 'sit' && message.action.seat === side)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('the launchpad opens over the same scene without a room reconnect', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const messages = await openRoom(page);
  const scene = await page.locator('[data-room-scene]').evaluate(element => {
    element.dataset.sceneIdentity = 'same';
    return element.getBoundingClientRect().toJSON();
  });
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'ゲームメニュー', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('tab', { name: 'いまのルーム', exact: true }).click();
  await expect(menu.getByRole('heading', { name: 'いまのルーム', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-room-scene]')).toHaveAttribute('data-scene-identity', 'same');
  expect(await page.locator('[data-room-scene]').evaluate(element => element.getBoundingClientRect().toJSON())).toEqual(scene);
  expect(messages.filter(message => message.type === 'hello')).toHaveLength(1);
});
