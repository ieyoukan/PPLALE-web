import { test, expect } from '@playwright/test';
import { emulatorIdentity, signInFixture } from './helpers/firebase-emulator.mjs';
const base = process.env.PPLALE_FIREBASE_BROWSER_URL;
test.setTimeout(90_000);
test.skip(!base, 'Run against the separate preview connected to demo Firebase emulators');

test('profiles, private friend requests, recruitment join/watch and removal work with real Firebase emulators', async ({ browser }) => {
  const a = await emulatorIdentity(), b = await emulatorIdentity();
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const alice = await contextA.newPage(), bob = await contextB.newPage();
  const errors = []; alice.on('pageerror', error => errors.push(error.message)); bob.on('pageerror', error => errors.push(error.message));
  try {
    await signInFixture(alice, base, a); await signInFixture(bob, base, b);
    for (const [page, name, comment] of [[alice, 'ありす', 'いちごで対戦しよう！'], [bob, 'ぼぶ', 'よろしくお願いします！']]) {
      await page.goto(`${base}/game/profile/`);
      await page.getByLabel('なまえ', { exact: true }).fill(name);
      await page.getByLabel('ひとこと', { exact: true }).fill(comment);
      await page.getByRole('button', { name: 'カードのアイコンを選ぶ', exact: true }).click();
      await page.getByRole('button', { name: 'あみのをアイコンにする', exact: true }).first().click();
      await page.getByRole('button', { name: 'プロフィールを保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('保存しました');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
      await page.reload(); await expect(page.getByLabel('なまえ', { exact: true })).toHaveValue(name);
    }
    await alice.goto(`${base}/game/profile/?id=${b.localId}`);
    await expect(alice.getByLabel('ひとこと', { exact: true })).toHaveCount(0);
    await alice.getByRole('button', { name: '＋ フレンド申請', exact: true }).click();
    await expect(alice.getByRole('status')).toContainText('フレンド申請を送りました');
    await bob.goto(`${base}/game/notifications/`);
    await expect(bob.getByText('ありす', { exact: true })).toBeVisible();
    await bob.getByRole('button', { name: '承認', exact: true }).click();
    await expect(bob.getByRole('button', { name: '承認', exact: true })).toHaveCount(0);
    await bob.goto(`${base}/game/social/`);
    await expect(bob.getByText('ありす', { exact: true })).toBeVisible();
    const room = { id: '654321', rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, host: 'ありす', hostProfileId: a.localId, hostOnline: true, status: 'lobby', open: true, spectators: true };
    for (const page of [alice, bob]) await page.route('http://localhost:8099/rooms/654321', route => route.fulfill({ json: room }));
    await alice.evaluate(() => localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ '654321': { seat: 0, token: 'test-seat-only', at: Date.now() } })));
    await alice.routeWebSocket('ws://localhost:8099/rooms/654321/socket', socket => socket.onMessage(bytes => {
      if (JSON.parse(bytes).type === 'hello') socket.send(JSON.stringify({ type: 'view', view: { id: '654321', version: 1, seat: 0, spectators: 0, status: 'lobby', match: 0, rules: room.rules, players: [{ name: 'ありす', profileId: a.localId, ready: false, online: true }, null], game: null, last: null, resigned: null } }));
    }));
    await alice.goto(`${base}/game/battle/room/?id=654321`);
    await alice.getByRole('button', { name: 'フレンドに対戦を募集する', exact: true }).click();
    await expect(alice.getByText('フレンドのソーシャル画面に表示中', { exact: true })).toBeVisible();
    const join = bob.getByRole('link', { name: 'ありすのルーム: 参加する', exact: true });
    await expect(join).toHaveAttribute('href', '/game/battle/room/?id=654321');
    room.open = false; room.status = 'playing';
    await bob.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(bob.getByRole('link', { name: 'ありすのルーム: 観戦する', exact: true })).toHaveAttribute('href', '/game/room/?id=654321&watch=1');
    await bob.screenshot({ path: 'test-results/social-friends.png', fullPage: true });
    await expect(bob.getByRole('button', { name: /リクエストインバイト|フレンドから外す/ })).toHaveCount(0);
    await bob.locator(`a[href="/game/profile/?id=${a.localId}"]`).first().click();
    await expect(bob.getByRole('button', { name: 'ありすに招待を送る', exact: true })).toBeVisible();
    await bob.getByRole('button', { name: 'フレンドから外す', exact: true }).click();
    await bob.getByRole('group', { name: 'フレンド解除の確認' }).getByRole('button', { name: '外す', exact: true }).click();
    await expect(bob.getByRole('status')).toContainText('フレンドから外しました');
    await bob.goto(`${base}/game/social/`);
    await expect(bob.getByText('ありす', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await contextA.close().catch(() => {}); await contextB.close().catch(() => {}); }
});
