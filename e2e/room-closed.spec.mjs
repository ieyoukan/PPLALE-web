import { test, expect } from '@playwright/test';
const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server');
test.use({ reducedMotion: 'reduce' });

for (const code of [4404, 1013]) for (const fails of [false, true]) test(`socket close ${code} and HTTP 410 end loading (home creation fails: ${fails})`, async ({ page }) => {
  const old = '123458'; let connections = 0, admissions = 0;
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'expired', at: Date.now() } } })), old);
  await page.routeWebSocket(/\/rooms\/123458\/socket/, socket => {
    connections++;
    socket.onMessage(() => socket.close({ code, reason: 'expired member' }));
  });
  await page.route(`**/rooms/${old}/join`, route => {
    admissions++; return route.fulfill({ status: 410, json: { error: 'このルームは閉じました' } });
  });
  await page.route('**/rooms', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    if (fails) return route.fulfill({ status: 410, json: { error: 'ホームルームの作成に失敗しました' } });
    return route.continue();
  });
  await page.goto(`${base}/game/room/${old}/`);
  if (fails) {
    await expect(page.getByRole('alert').filter({ hasText: 'このルームは閉じました' })).toContainText('このルームは閉じました', { timeout: 20000 });
    await expect(page.getByRole('button', { name: 'インバイトのルームを作る' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ルームチャット', exact: true })).toHaveCount(0);
  } else {
    await page.waitForURL(url => /\/game\/room\/\d{6}\/$/.test(url.pathname) && !url.pathname.includes(old));
    await expect(page.getByRole('button', { name: 'ルームチャット', exact: true })).toBeVisible();
  }
  if (code === 4404) expect(connections).toBe(1); else expect(connections).toBeGreaterThan(1);
  expect(admissions).toBe(1);
});
