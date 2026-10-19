import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a local app connected to a room server');

async function probe(context, { muted = false, unsupported = false } = {}) {
  await context.addInitScript(({ muted, unsupported }) => {
    window.__chimes = [];
    if (muted) localStorage.setItem('pplale-notification-sound-v1', 'off');
    if (unsupported) { window.AudioContext = undefined; return; }
    const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    window.AudioContext = class {
      state = 'suspended'; currentTime = 0; destination = {};
      resume() { this.state = 'running'; return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
      createOscillator() {
        const oscillator = { frequency: parameter(), connect() {}, disconnect() {},
          start(at) { window.__chimes.push({ frequency: oscillator.frequency.value, at }); },
          stop() { oscillator.onended?.(); },
        };
        return oscillator;
      }
    };
  }, { muted, unsupported });
}

const chimes = page => page.evaluate(() => window.__chimes);

test('free match chimes once per event, survives navigation and stays silent on reconnect', async ({ browser }) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext({ viewport: { width: 390, height: 844 } })]);
  const errors = [];
  try {
    for (const context of contexts) await probe(context);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    let activityRequests = 0;
    for (const [index, page] of pages.entries()) {
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().endsWith('/free-match/live')) activityRequests++; });
      await page.goto(`${base}/game/battle/`);
      await expect(page.getByRole('region', { name: 'いま遊んでいるプレイヤー' })).toHaveCount(0);
      await page.getByRole('link', { name: /フリーマッチ 対戦相手を自動で探す/ }).click();
      await page.getByPlaceholder('なまえ').fill(`通知確認${index}`);
      await expect(page.getByRole('button', { name: '通知音', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'このデッキで対戦相手を探す' }).click();
    }
    for (const page of pages) {
      await expect(page).toHaveURL(/\/game\/room\/\?id=\d{6}/);
      await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
      await expect.poll(async () => (await chimes(page)).length).toBe(5);
      const notes = await chimes(page);
      expect(notes.map(note => note.frequency)).toEqual([659.25, 880, 523.25, 659.25, 783.99]);
      expect(notes[2].at).toBeGreaterThan(notes[1].at);
      await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible();
    }
    await pages[0].reload();
    await expect(pages[0].getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible();
    await pages[0].getByRole('button', { name: 'メニュー', exact: true }).click();
    expect(await chimes(pages[0])).toHaveLength(0);
    await pages[0].getByRole('button', { name: '通知音', exact: true }).click();
    await expect(pages[0].getByRole('button', { name: '通知音', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(pages[0].getByRole('button', { name: '通知音', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await pages[0].reload();
    await expect(pages[0].getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible();
    await pages[0].getByRole('button', { name: 'メニュー', exact: true }).click();
    await expect(pages[0].getByRole('button', { name: '通知音', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(pages[0].getByRole('button', { name: '通知音', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(await chimes(pages[0])).toHaveLength(0);
    expect(activityRequests).toBe(0);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('muted and unsupported audio never prevent matchmaking', async ({ browser }) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    await probe(contexts[0], { muted: true }); await probe(contexts[1], { unsupported: true });
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of pages) {
      await page.goto(`${base}/game/battle/free/`);
      await page.getByRole('button', { name: 'このデッキで対戦相手を探す' }).click();
    }
    for (const page of pages) {
      await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
      expect(await chimes(page)).toHaveLength(0);
    }
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('room players hear opponent arrival and start; spectators stay silent', async ({ browser }, info) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) await probe(context);
    const [host, guest, watcher] = await Promise.all(contexts.map(context => context.newPage()));
    await host.goto(`${base}/game/battle/`);
    await host.getByRole('button', { name: /ルームを作る/ }).click();
    await host.getByRole('checkbox', { name: '観戦を許可する' }).check();
    await host.getByRole('button', { name: 'このルールでルームを作る' }).click();
    await host.waitForURL(/battle\/room\/\?id=\d{6}/);
    const lobby = host.url(), id = new URL(lobby).searchParams.get('id');
    await watcher.goto(`${base}/game/room/?id=${id}&watch=1`);
    await watcher.getByRole('heading', { name: '対戦が始まるのを待っています' }).click();
    await guest.goto(lobby);
    await guest.getByRole('button', { name: 'このルームに入る' }).click();
    for (const page of [host, guest]) await expect.poll(async () => (await chimes(page)).length).toBe(2);
    await guest.getByRole('button', { name: 'このデッキで準備OK' }).click();
    await host.getByRole('button', { name: 'このデッキで準備OK' }).click();
    for (const page of [host, guest, watcher]) await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    for (const page of [host, guest]) await expect.poll(async () => (await chimes(page)).length).toBe(5);
    expect(await chimes(watcher)).toHaveLength(0);
    await host.getByRole('button', { name: 'メニュー', exact: true }).click();
    await expect(host.getByRole('button', { name: '通知音', exact: true })).toBeVisible({ timeout: 20000 });
    await host.screenshot({ path: info.outputPath('notification-control.png') });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});


test('CPU match start chimes once and keeps the menu compact on mobile', async ({ browser }, info) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await probe(context);
    const page = await context.newPage();
    await page.goto(`${base}/game/`);
    const toggle = page.getByRole('button', { name: '通知音', exact: true });
    await expect(toggle).toBeInViewport();
    const login = page.getByRole('button', { name: 'ログイン', exact: true });
    await expect(login).toBeInViewport();
    expect((await login.boundingBox()).height).toBeLessThan(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('notification-menu-mobile.png') });
    await page.getByRole('button', { name: '対戦をはじめる', exact: false }).click();
    await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => (await chimes(page)).length).toBe(3);
    await page.reload();
    await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    expect(await chimes(page)).toHaveLength(0);
  } finally { await context.close(); }
});
