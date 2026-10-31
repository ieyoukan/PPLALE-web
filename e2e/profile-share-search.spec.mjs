import { test, expect } from '@playwright/test';
import { emulatorIdentity, signInFixture } from './helpers/firebase-emulator.mjs';
const base = process.env.PPLALE_FIREBASE_BROWSER_URL;
test.setTimeout(120_000);
test.skip(!base, 'Run against the separate preview connected to demo Firebase emulators');

async function makeProfile(page, name) {
  await page.goto(`${base}/game/profile/`);
  await page.getByLabel('なまえ', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();
}

test('a profile shares a short link from its top, a signed-out visitor signs in from it and asks once, and names can be searched', async ({ browser }) => {
  const a = await emulatorIdentity(), b = await emulatorIdentity(), run = Date.now() % 100000, name = `シェア${run}`;
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })));
  const [alice, guest, bob] = await Promise.all(contexts.map(context => context.newPage()));
  const errors = []; for (const page of [alice, guest, bob]) page.on('pageerror', error => errors.push(error.message));
  try {
    await signInFixture(alice, base, a);
    await makeProfile(alice, name);
    // The link is in the first screen, without scrolling.
    const copy = alice.getByRole('button', { name: 'プロフィールのリンクをコピー', exact: true });
    await expect(copy).toBeInViewport();
    await copy.click();
    const link = await alice.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(`${new URL(base).origin}/u/${a.localId}`);

    await guest.goto(link);
    await expect(guest.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(guest.getByLabel('いまいるルーム')).toContainText('フレンド限定');
    const [popup] = await Promise.all([guest.waitForEvent('popup'), guest.getByRole('button', { name: 'ログインしてフレンドになる', exact: true }).click()]);
    await popup.waitForLoadState();
    await popup.getByText('Add new account').click();
    await popup.getByText('Auto-generate user information').click();
    await popup.getByText('Sign in with Google').click();
    // A first sign-in sets up the visitor's profile; the request goes once it is saved.
    await guest.getByRole('dialog').getByLabel('なまえ').fill('はじめて');
    await guest.getByRole('button', { name: '保存してはじめる', exact: true }).click();
    await expect(guest.getByText('フレンド申請を送りました')).toBeVisible();
    await expect(guest.getByRole('button', { name: '申請中', exact: true })).toBeDisabled();

    await signInFixture(bob, base, b);
    await makeProfile(bob, 'さがすひと');
    await bob.goto(`${base}/game/social/`);
    const search = bob.getByRole('searchbox', { name: 'ユーザーをさがす' });
    // The name in hiragana finds the katakana name.
    await search.fill(`しぇあ${run}`);
    await expect(bob.locator(`a[href="/game/profile/?id=${a.localId}"]`)).toBeVisible();
    await search.fill('みつからないなまえ');
    await expect(bob.getByText('見つかりませんでした')).toBeVisible();
    await search.fill(link);
    await expect(bob.getByRole('link', { name: 'プロフィールを見る ›' })).toHaveAttribute('href', `/game/profile/?id=${a.localId}`);

    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close().catch(() => {}))); }
});
