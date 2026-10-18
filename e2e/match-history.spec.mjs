import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

// A frozen v1 recording catches future renderer/schema regressions without applying today's rules.
const recording = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/replay-v1.json.gz', import.meta.url))));
const base = process.env.PPLALE_ROOM_TEST_URL ?? 'http://localhost:3000';


for (const width of [1280, 375, 320]) test(`history and exact frame playback at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const entries = Array.from({ length: 5 }, (_, index) => ({ ...structuredClone(recording.match), id: index === 0 ? recording.match.id : randomUUID(), favorite: index === 1 }));
  let gameRequests = 0;
  page.on('request', request => { if (/\/rooms\//.test(request.url())) gameRequests++; });
  await page.route('**/history/**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/history/')) return route.continue();
    const body = route.request().postDataJSON() ?? {};
    if (url.pathname.endsWith('/list')) return route.fulfill({ json: { entries: body.favorites ? entries.filter(entry => entry.favorite) : entries, cursor: null } });
    if (url.pathname.endsWith('/favorite')) { const id = url.pathname.split('/').at(-2); entries.find(entry => entry.id === id).favorite = body.value; return route.fulfill({ json: { ok: true } }); }
    if (url.pathname.endsWith('/detail')) { const detail = { format: recording.format, match: recording.match, catalog: recording.catalog }; return route.fulfill({ json: detail }); }
    return route.fulfill({ json: recording });
  });
  await page.goto(`${base}/game/battle/history/`, { waitUntil: 'load' });
  await expect(page.locator('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'おやつのともだちとの対戦をお気に入りにする', exact: true }).first().click();
  await page.getByRole('tab', { name: '★ お気に入り' }).click();
  await expect(page.locator('article')).toHaveCount(2);
  await page.reload(); await expect(page.locator('article')).toHaveCount(5);
  await page.getByRole('button', { name: '詳細・デッキ', exact: true }).first().click();
  const detail = page.getByRole('dialog', { name: '対戦の詳細' }); await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: '相手のデッキ', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '相手のおやつ' })).toBeVisible();
  await detail.getByRole('button', { name: '自分のデッキ', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '自分のいちご' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0);
  await page.getByRole('button', { name: 'リプレイ', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '最後へ', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '一手進む', exact: true }).click();
  await expect(page.locator('output')).toHaveText(`1 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: '最後へ', exact: true }).click();
  await expect(page.locator('output')).toHaveText(`${recording.frames.length - 1} / ${recording.frames.length - 1}手`);
  const final = recording.frames.at(-1);
  const uid = final.state.players[0].hand[0] ?? final.state.players[0].field[0];
  if (uid) {
    await page.locator(`[data-recorded-uid="${uid}"]`).click();
    const inspected = page.getByRole('dialog', { name: 'カードの確認' });
    const value = final.presentation.cards[uid];
    await expect(inspected).toContainText(`コスト ${value.cost} · 攻撃 ${value.attack} · HP ${value.hp}`);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: '一手戻る', exact: true }).click();
  await expect(page.locator('output')).toHaveText(`${recording.frames.length - 2} / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: '最初へ', exact: true }).click();
  await page.getByRole('combobox', { name: '再生速度' }).selectOption('4');
  await page.getByRole('button', { name: '再生する', exact: true }).click();
  await expect(page.locator('output')).not.toHaveText(`0 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  const paused = await page.locator('output').innerText(); await page.waitForTimeout(500); await expect(page.locator('output')).toHaveText(paused);
  await page.getByRole('button', { name: '視点切替', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '記録を保存', exact: true }).click();
  const file = await download; const exported = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(exported.frames).toEqual(recording.frames); expect(exported.catalogs).toEqual(recording.catalogs);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(gameRequests).toBe(0); expect(errors).toEqual([]);
});

const apiKey = 'AIzaSyBTXnTZ7ZG5oYi2dE69Dls8bM6CVOlJAyA';
const authKey = `firebase:authUser:${apiKey}:[DEFAULT]`;
async function changeIdentity(tab, uid) {
  // Exercise Firebase's real cross-tab IndexedDB observer, without a real login or backend account.
  await tab.evaluate(async ({ uid, apiKey, authKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('firebaseLocalStorageDb', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('firebaseLocalStorage', 'readwrite');
      const store = tx.objectStore('firebaseLocalStorage');
      if (uid) store.put({ fbase_key: authKey, value: { uid, emailVerified: true, isAnonymous: false, providerData: [], displayName: uid, apiKey, appName: '[DEFAULT]', createdAt: '1', lastLoginAt: '1', stsTokenManager: { accessToken: `fixture-${uid}`, refreshToken: 'fixture-refresh', expirationTime: Date.now() + 3_600_000 } } });
      else store.delete(authKey);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { uid, apiKey, authKey });
}

for (const kind of ['detail', 'replay', 'pending-detail', 'pending-replay']) test(`auth change clears ${kind}, including late responses`, async ({ page, context }) => {
  const storage = await context.newPage();
  await storage.route('**/auth-storage-test.html', route => route.fulfill({ contentType: 'text/html', body: '<html><body>auth storage</body></html>' }));
  await storage.goto(`${base}/auth-storage-test.html`);
  await changeIdentity(storage, 'alice');
  await context.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { users: [{ localId: 'alice', displayName: 'alice', emailVerified: true, providerUserInfo: [] }] } }));
  const requests = [];
  let finishPending;
  let pending;
  await page.route('**/history/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/history/')) return route.continue();
    const auth = route.request().headers().authorization;
    requests.push({ path, auth });
    if (path.endsWith('/list')) return route.fulfill({ json: { entries: auth === 'Bearer fixture-alice' ? [recording.match] : [], cursor: null } });
    if (auth !== 'Bearer fixture-alice') return route.fulfill({ status: 404, json: { error: '履歴が見つかりません' } });
    const value = path.endsWith('/detail') ? { format: 1, match: recording.match, catalog: recording.catalog } : recording;
    if (kind.startsWith('pending-') && auth === 'Bearer fixture-alice') {
      pending = new Promise(resolve => { finishPending = resolve; });
      await pending;
    }
    await route.fulfill({ json: value }).catch(() => {});
  });
  const isReplay = kind.endsWith('replay');
  await page.goto(`${base}${isReplay ? `/game/replay/?id=${recording.match.id}` : '/game/battle/history/'}`);
  if (isReplay && !kind.startsWith('pending-')) await expect(page.getByRole('button', { name: '最後へ', exact: true })).toBeVisible();
  if (!isReplay) {
    await expect(page.locator('article')).toHaveCount(1);
    await page.getByRole('button', { name: '詳細・デッキ', exact: true }).click();
    if (!kind.startsWith('pending-')) await expect(page.getByRole('dialog')).toBeVisible();
  }
  if (kind.startsWith('pending-')) await expect.poll(() => !!finishPending).toBe(true);
  await changeIdentity(storage, null);
  if (!isReplay) { await expect(page.locator('article')).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0); }
  else { await expect.poll(() => requests.some(request => request.path === `/history/${recording.match.id}` && !request.auth)).toBe(true); await expect(page.getByRole('button', { name: '最後へ', exact: true })).toHaveCount(0); }
  finishPending?.();
  if (isReplay) {
    // Anonymous access must fail instead of showing the previous account's record.
    // Reconfigure the mocked endpoint then switch to another account.
    await page.route('**/history/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/history/')) return route.continue();
      requests.push({ path, auth: route.request().headers().authorization });
      return route.fulfill({ status: 404, json: { error: '履歴が見つかりません' } });
    });
  }
  await changeIdentity(storage, 'bob');
  await expect.poll(() => requests.some(request => request.auth === 'Bearer fixture-bob')).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (isReplay) { await expect(page.getByRole('button', { name: '最後へ', exact: true })).toHaveCount(0); await expect(page.getByText('履歴が見つかりません', { exact: true })).toBeVisible(); }
  else await expect(page.locator('article')).toHaveCount(0);
});

test('video controls, log selection, exact move jump and scene links', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/history/**', route => new URL(route.request().url()).pathname.startsWith('/history/') ? route.fulfill({ json: recording }) : route.continue());
  await page.goto(`${base}/game/replay/?id=${recording.match.id}&step=5`);
  const output = page.locator('output');
  await expect(output).toHaveText(`5 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: '10手進む', exact: true }).click();
  await expect(output).toHaveText(`15 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: '10手戻す', exact: true }).click();
  await expect(output).toHaveText(`5 / ${recording.frames.length - 1}手`);
  await page.getByLabel('移動する手数', { exact: true }).fill('23');
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await expect(output).toHaveText(`23 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: 'ログ', exact: true }).click();
  const logs = page.getByRole('dialog', { name: '対戦ログから移動' });
  await logs.getByRole('button', { name: /^8手 ·/ }).click();
  await expect(logs).toHaveCount(0); await expect(output).toHaveText(`8 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: 'この場面のリンク', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${base}/game/replay/?id=${recording.match.id}&step=8`);
  await page.getByRole('heading', { name: 'リプレイ', exact: true }).click();
  await page.keyboard.press('ArrowLeft'); await expect(output).toHaveText(`7 / ${recording.frames.length - 1}手`);
  await page.getByRole('button', { name: '早送りで再生', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '再生速度' })).toHaveValue('2');
  await expect(page.getByRole('button', { name: '一時停止', exact: true })).toBeVisible();
});
