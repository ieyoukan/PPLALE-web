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
      await expect(page.getByLabel('なまえ', { exact: true })).toHaveValue('');
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
      await expect(page.getByPlaceholder('なまえ')).toHaveAttribute('readonly', '');
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

test('switching accounts keeps match names scoped to each public profile', async ({ page }) => {
  const a = { ...await emulatorIdentity(), displayName: privateName }, b = { ...await emulatorIdentity(), displayName: '本名テストB' };
  await signInFixture(page, base, a);
  await page.goto(`${base}/game/profile/`);
  await page.getByLabel('なまえ', { exact: true }).fill('アカウントAの公開名');
  await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存しました');
  await page.goto(`${base}/game/battle/free/`);
  await expect(page.getByPlaceholder('なまえ')).toHaveValue('アカウントAの公開名');
  await expect(page.getByPlaceholder('なまえ')).toHaveAttribute('readonly', '');
  await signInFixture(page, base, b);
  await page.goto(`${base}/game/battle/free/`);
  const setup = page.getByRole('dialog', { name: 'はじめまして！' });
  await expect(setup).toBeVisible();
  await expect(setup.getByLabel('なまえ', { exact: true })).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('本名テストB');
  await expect(page.locator('body')).not.toContainText('アカウントAの公開名');
  await setup.getByLabel('なまえ', { exact: true }).fill('アカウントBの公開名');
  await setup.getByRole('button', { name: '保存してはじめる' }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.getByPlaceholder('なまえ')).toHaveValue('アカウントBの公開名');
});

test('shared decks show the current profile name to visitors and update when the profile is renamed', async ({ page, browser }) => {
  const identity = { ...await emulatorIdentity(), displayName: privateName };
  await signInFixture(page, base, identity);
  await page.goto(`${base}/game/profile/`);
  await page.getByLabel('なまえ', { exact: true }).fill('デッキ作者の公開名');
  await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存しました');
  const url = `http://127.0.0.1:18082/v1/projects/demo-pplale-social/databases/(default)/documents/users/${identity.localId}/decks/shared-profile-test`;
  const saved = await fetch(url, { method: 'PATCH', headers: { authorization: `Bearer ${identity.idToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { name: { stringValue: 'プロフィール名の確認デッキ' }, yojoDeckIds: { arrayValue: { values: [] } }, sweetDeckIds: { arrayValue: { values: [] } }, playableCardId: { stringValue: 'p_1' } } }) });
  expect(saved.status).toBe(200);
  const visitor = await browser.newContext();
  try {
    const shared = await visitor.newPage();
    await shared.goto(`${base}/deck/${identity.localId}/shared-profile-test/`);
    const author = shared.getByRole('link', { name: 'デッキ作者の公開名', exact: true });
    await expect(author).toBeVisible();
    await expect(author).toHaveAttribute('href', `/game/profile/?id=${identity.localId}`);
    await expect(shared.locator('body')).not.toContainText(privateName);
    await page.getByLabel('なまえ', { exact: true }).fill('変更した公開名');
    await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('保存しました');
    await expect(shared.getByRole('link', { name: '変更した公開名', exact: true })).toBeVisible();
    await expect(shared.getByRole('link', { name: 'デッキ作者の公開名', exact: true })).toHaveCount(0);
    await shared.reload();
    await expect(shared.locator('meta[name="description"]')).toHaveAttribute('content', /変更した公開名/);
  } finally { await visitor.close(); }
});

test('guests can still choose a match name independently of signed-in profiles', async ({ page }) => {
  await page.goto(`${base}/game/battle/free/`);
  const name = page.getByPlaceholder('なまえ');
  await expect(name).toBeEditable();
  await name.fill('ゲストのなまえ');
  await page.reload();
  await expect(page.getByPlaceholder('なまえ')).toHaveValue('ゲストのなまえ');
});
