import { test, expect } from '@playwright/test';
import { emulatorIdentity, signInFixture } from './helpers/firebase-emulator.mjs';
import { arena } from '../packages/game-core/tests/helpers.mjs';

const base = process.env.PPLALE_FIREBASE_BROWSER_URL;
test.skip(!base, 'Run only against a local app connected to demo Firebase emulators');
test.setTimeout(90000);
const privateName = '本名テストA', privateEmail = 'private-account@example.invalid', privatePhoto = 'https://example.invalid/google-private-photo.png';

for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  test.describe(`profile privacy ${viewport.width}`, () => {
    test.use({ viewport });
    test('public names are used for matching and results; account details and legacy names stay out of the UI', async ({ page }) => {
      const identity = { ...await emulatorIdentity(), displayName: privateName, email: privateEmail, photoURL: privatePhoto };
      await signInFixture(page, base, identity);
      await page.addInitScript(({ privateName, privateEmail, privatePhoto }) => {
        localStorage.setItem('pplale-room-name-v1', privateName);
        window.__privateLeaks = [];
        const check = () => {
          const shown = `${document.body?.innerText ?? ''} ${[...document.querySelectorAll('input')].map(input => input.value).join(' ')} ${[...document.images].map(image => `${image.src} ${image.alt}`).join(' ')}`;
          for (const value of [privateName, privateEmail, privatePhoto]) if (shown.includes(value)) window.__privateLeaks.push(value);
        };
        new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
      }, { privateName, privateEmail, privatePhoto });
      const nickname = `公開名${viewport.width}`;
      await page.goto(`${base}/game/profile/`);
      await expect(page.getByLabel('なまえ', { exact: true })).toHaveValue('プレイヤー');
      await page.getByLabel('なまえ', { exact: true }).fill(nickname);
      await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('保存しました');
      expect(await page.evaluate(() => window.__privateLeaks)).toEqual([]);

      await page.route('http://localhost:8099/stats', route => route.fulfill({ json: { version: 'test', backend: 'memory', rooms: {}, total: {}, pods: 1, connections: 0 } }));
      let sent;
      await page.route('http://localhost:8099/rooms', route => {
        sent = route.request().postDataJSON();
        return route.fulfill({ status: 503, json: { error: 'テストではルームを作りません' } });
      });
      await page.goto(`${base}/game/battle/`);
      await page.getByRole('button', { name: /ルームを作る/ }).click();
      await expect(page.getByPlaceholder('なまえ')).toHaveValue(nickname);
      await page.getByRole('button', { name: 'このルールでルームを作る', exact: true }).click();
      await expect.poll(() => sent?.name).toBe(nickname);
      expect(Object.keys(sent).sort()).toEqual(['name', 'rules']);
      expect(JSON.stringify(sent)).not.toContain(privateName);
      expect(JSON.stringify(sent)).not.toContain(privateEmail);
      await page.getByPlaceholder('なまえ').fill('今回だけの別名');
      await page.goto(`${base}/game/battle/free/`);
      await expect(page.getByPlaceholder('なまえ')).toHaveValue(nickname);
      let search;
      await page.route('http://localhost:8099/free-match/*', route => {
        if (route.request().url().endsWith('/start')) search = route.request().postDataJSON();
        return route.fulfill({ json: { status: route.request().url().endsWith('/cancel') ? 'cancelled' : 'waiting' } });
      });
      await page.getByRole('button', { name: /このデッキで対戦相手を探す/ }).click();
      await expect.poll(() => search?.name).toBe(nickname);
      expect(Object.keys(search).sort()).toEqual(['deck', 'name', 'token']);
      expect(JSON.stringify(search)).not.toContain(privateName);
      expect(await page.evaluate(() => window.__privateLeaks)).toEqual([]);

      const game = arena(); game.winner = 0; game.players[1].points = 0;
      await page.evaluate(game => localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'cpu', level: 'easy' })), game);
      await page.goto(`${base}/game/play/`);
      const result = page.getByRole('dialog', { name: '対戦結果' });
      await expect(result).toBeVisible({ timeout: 20000 });
      await expect(result).toContainText(nickname);
      await expect(result).not.toContainText(privateName);
      expect(await page.evaluate(() => window.__privateLeaks)).toEqual([]);

      // The shared-site login menu must not expose the Google photo, name or email on screenshots either.
      await page.goto(`${base}/build/`);
      const account = page.getByRole('button', { name: nickname, exact: true });
      await expect(account).toBeVisible({ timeout: 20000 });
      await account.click();
      await expect(page.getByRole('button', { name: /^(ログアウト|Sign out)$/ })).toBeVisible();
      expect(await page.evaluate(() => window.__privateLeaks)).toEqual([]);
    });
  });
}

test('switching accounts never imports a previously saved room name or another account’s alias', async ({ page }) => {
  const a = { ...await emulatorIdentity(), displayName: privateName }, b = { ...await emulatorIdentity(), displayName: '本名テストB' };
  await signInFixture(page, base, a);
  await page.goto(`${base}/game/profile/`);
  await page.getByLabel('なまえ', { exact: true }).fill('アカウントAの公開名');
  await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存しました');
  await page.goto(`${base}/game/battle/free/`);
  await expect(page.getByPlaceholder('なまえ')).toHaveValue('アカウントAの公開名');
  await page.getByPlaceholder('なまえ').fill('Aの対戦専用名');
  await signInFixture(page, base, b);
  await page.goto(`${base}/game/battle/free/`);
  await expect(page.getByPlaceholder('なまえ')).toHaveValue('プレイヤー');
  await expect(page.locator('body')).not.toContainText('本名テストB');
  await expect(page.locator('body')).not.toContainText('アカウントAの公開名');
});
