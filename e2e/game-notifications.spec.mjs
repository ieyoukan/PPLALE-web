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

async function seatPair(pages) {
  for (const [index, page] of pages.entries()) await page.addInitScript(name => localStorage.setItem('pplale-guest-name-v2', name), `通知確認${index}`);
  await pages[0].goto(`${base}/game/`);
  await pages[0].waitForURL(/\/game\/room\/\d{6}\/$/);
  const invite = await pages[0].evaluate(() => { const saved = JSON.parse(localStorage.getItem('pplale-plaza-v1')); return saved.rooms[saved.current].invite; });
  await pages[1].goto(`${pages[0].url()}?invite=${invite}`);
  await pages[0].getByRole('button', { name: 'この席にすわる', exact: true }).first().click();
  await pages[1].getByRole('button', { name: 'この席にすわる', exact: true }).last().click();
  for (const page of pages) await page.getByRole('button', { name: 'じゅんびOK!', exact: true }).click();
}

test('room match chimes once per event, survives navigation and stays silent on reconnect', async ({ browser }) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext({ viewport: { width: 390, height: 844 } })]);
  const errors = [];
  try {
    for (const context of contexts) await probe(context);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of pages) page.on('pageerror', error => errors.push(error.message));
    await seatPair(pages);
    for (const page of pages) {
      await expect(page).toHaveURL(/\/game\/room\/\d{6}\/$/, { timeout: 15000 });
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
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('muted and unsupported audio never prevent room play', async ({ browser }) => {
  test.setTimeout(60000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    await probe(contexts[0], { muted: true }); await probe(contexts[1], { unsupported: true });
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    await seatPair(pages);
    for (const page of pages) {
      await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
      expect(await chimes(page)).toHaveLength(0);
    }
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('room players hear someone sit across and the start; those watching stay silent', async ({ browser }, info) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) await probe(context);
    const [host, guest, watcher] = await Promise.all(contexts.map(context => context.newPage()));
    await host.goto(`${base}/game/`);
    await host.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
    const { id, invite } = await host.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('pplale-plaza-v1'));
      return { id: saved.current, invite: saved.rooms[saved.current].invite };
    });
    for (const page of [guest, watcher]) {
      await page.goto(`${base}/game/room/${id}/?invite=${invite}`);
      await page.waitForURL(`${base}/game/room/${id}/`);
    }
    await host.getByRole('button', { name: 'この席にすわる' }).last().click();
    await guest.getByRole('button', { name: 'この席にすわる' }).click();
    for (const page of [host, guest]) await expect.poll(async () => (await chimes(page)).length).toBe(2);
    for (const page of [guest, host]) await page.getByRole('button', { name: 'じゅんびOK!' }).click();
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
    await page.waitForURL(/\/game\/room\/\d{6}\/$/);
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'ゲームメニュー', exact: true });
    const login = menu.getByRole('button', { name: 'Googleでログイン', exact: true });
    await expect(login).toBeInViewport();
    expect((await login.boundingBox()).height).toBeLessThan(50);
    await menu.getByRole('tab', { name: '音量', exact: true }).click();
    await expect(menu.getByRole('button', { name: '通知音', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('notification-menu-mobile.png') });
    await menu.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
    await page.getByRole('button', { name: 'この席にすわる', exact: true }).first().click();
    await page.getByRole('button', { name: '対戦相手をえらぶ', exact: true }).click();
    await page.getByRole('button', { name: 'CPUと対戦', exact: true }).click();
    const cpu = page.getByRole('dialog', { name: 'CPUをえらぶ', exact: true });
    await cpu.getByRole('button', { name: /よわい/ }).click();
    await cpu.getByRole('button', { name: 'このCPUを呼ぶ', exact: true }).click();
    await page.getByRole('button', { name: 'じゅんびOK!', exact: true }).click();
    await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => (await chimes(page)).length).toBe(3);
    await page.reload();
    await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
    expect(await chimes(page)).toHaveLength(0);
  } finally { await context.close(); }
});
