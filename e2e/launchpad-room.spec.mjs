import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');
const recording = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/replay-v1.json.gz', import.meta.url))));

async function room(page) {
  const id = '123456';
  const members = Array.from({ length: 16 }, (_, i) => ({ id: `member-${i}`, name: i ? `ゲスト${i}` : 'あなた', online: true }));
  const view = { id, version: 1, status: 'lobby', match: 0, seat: 0, spectators: 0,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, players: [null, null], game: null, last: null, resigned: null,
    plaza: { name: 'みんなのお菓子ルーム', visibility: 'invite', me: members[0].id, owner: members[0].id, creator: { name: 'あなた' }, members, invite: 'test-invite' },
  };
  const messages = [];
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, socket => socket.onMessage(bytes => {
    const message = JSON.parse(String(bytes)); messages.push(message);
    if (message.type === 'hello') socket.send(JSON.stringify({ type: 'view', view }));
  }));
  await page.goto(`${base}/game/room/${id}/`);
  await expect(page.getByRole('button', { name: 'この席にすわる' }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  return { messages, url: page.url(), pad: page.getByRole('dialog', { name: 'ゲームメニュー' }) };
}

test('home creates a room after social, and the current room scrolls to all its users', async ({ page }, info) => {
  const { pad, url } = await room(page);
  await expect(page.getByText('空いている席をタップして、対戦にさんか', { exact: true })).toHaveCount(0);
  const links = pad.getByRole('region', { name: 'クイックリンク' });
  await expect(links.getByRole('heading')).toHaveCount(0);
  await expect(links.getByRole('button')).toHaveText(['ソーシャル', 'ルーム', 'カード', 'リーサルパズル', '対戦履歴', '盤面エディタ']);
  const sizes = await links.getByRole('button').evaluateAll(buttons => buttons.map(button => ({ width: button.offsetWidth, height: button.offsetHeight })));
  for (const size of sizes) expect(size).toEqual(sizes[0]);
  await page.screenshot({ path: info.outputPath('launchpad-home.png') });
  await links.getByRole('button', { name: 'ルーム', exact: true }).click();
  await pad.getByRole('button', { name: 'ルームを作る', exact: true }).click();
  const creation = page.getByRole('dialog', { name: '新しいルームを作る' });
  await expect(creation.getByRole('radio')).toHaveCount(5);
  await expect(creation.getByRole('radio', { name: /^インバイト 招待/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await pad.getByRole('button', { name: 'もどる', exact: true }).click();
  await pad.getByRole('button', { name: 'ランチパッドに縮小', exact: true }).click();
  await pad.getByRole('button', { name: 'さそう', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'ルームにさそう' })).toBeVisible();
  await page.keyboard.press('Escape');
  await pad.getByRole('tab', { name: 'いまのルーム', exact: true }).click();
  const panel = pad.getByRole('tabpanel');
  const people = panel.getByRole('region', { name: 'ルームにいるユーザー' });
  await expect(people.getByRole('region', { name: 'あなた', exact: true }).getByRole('listitem')).toHaveCount(1);
  await expect(people.getByRole('region', { name: 'フレンド', exact: true }).getByRole('listitem')).toHaveCount(0);
  await expect(people.getByRole('region', { name: 'ほかの人', exact: true }).getByRole('listitem')).toHaveCount(15);
  await people.getByText('ゲスト15', { exact: true }).scrollIntoViewIfNeeded();
  await expect(people.getByText('ゲスト15', { exact: true })).toBeInViewport();
  expect(await panel.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page).toHaveURL(url);
  await page.screenshot({ path: info.outputPath('current-room-users.png') });
});

test('a room match replay opens from history while keeping the room connection', async ({ page }) => {
  await page.route('**/history/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/list') ? { entries: [recording.match], cursor: null }
      : path.endsWith('/detail') ? { format: recording.format, match: recording.match, catalog: recording.catalog } : recording });
  });
  const { pad, url, messages } = await room(page);
  await pad.getByRole('button', { name: '対戦履歴', exact: true }).click();
  await pad.getByRole('button', { name: '詳細・デッキ', exact: true }).first().click();
  await page.getByRole('link', { name: 'リプレイを見る ▶' }).click();
  await expect(page.locator('[data-table]')).toBeVisible({ timeout: 20000 });
  expect(messages.filter(message => message.type === 'hello')).toHaveLength(1);
  expect(messages.some(message => message.action === 'leave')).toBe(false);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'ゲームメニュー' }).getByRole('button', { name: 'ホーム', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'ホームへ移動しますか？', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '移動する', exact: true }).click();
  await page.waitForURL(target => /^\/game\/room\/\d{6}\/$/.test(target.pathname) && target.href !== url);
  await expect(page.getByRole('button', { name: 'この席にすわる' }).first()).toBeVisible();
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test(`launchpad keeps its portrait size across tabs at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const { pad } = await room(page);
    // The development badge overlaps the rotated phone's home tab; it is absent in production.
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    // Layout dimensions stay in stage coordinates even when the phone turns the game sideways.
    const bounds = () => pad.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight, x: element.offsetLeft, y: element.offsetTop }));
    const identity = pad.getByRole('button', { name: '自分のプロフィール', exact: true });
    const clock = pad.getByLabel('現在の時刻');
    await expect(identity).toContainText('あなた');
    await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
    const status = pad.getByLabel('プレイヤーと時計');
    const top = await status.evaluate(el => el.offsetTop);
    const small = await bounds();
    expect(small.height).toBeGreaterThan(small.width);
    const tabs = ['通知', 'いまのルーム', '音量', '設定', 'ランチパッドホーム'];
    for (const name of tabs) {
      await pad.getByRole('tab', { name, exact: true }).click();
      await expect(pad.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
      expect(await bounds()).toEqual(small);
      await expect(identity).toBeInViewport(); await expect(clock).toBeInViewport();
      expect(await status.evaluate(el => el.offsetTop)).toBe(top);
    }
    await pad.getByRole('button', { name: 'ゲームメニューを拡大' }).click();
    const large = await bounds();
    expect(large.width).toBeGreaterThan(small.width);
    for (const name of tabs.map(name => name === 'ランチパッドホーム' ? 'いまのぷぷりえーる' : name)) {
      await pad.getByRole('tab', { name, exact: true }).click();
      expect(await bounds()).toEqual(large);
      await expect(identity).toHaveCount(0); await expect(clock).toHaveCount(0);
    }
    await pad.getByRole('button', { name: 'ランチパッドに縮小' }).click();
    expect(await bounds()).toEqual(small);
    await expect(pad.getByRole('button', { name: '自分のプロフィール', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('launchpad-fixed-portrait.png') });
    await identity.click();
    await expect(pad.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeVisible();
    // Opening a profile expands the pad, so the compact status row is absent there too.
    await expect(identity).toHaveCount(0); await expect(clock).toHaveCount(0);
    await pad.getByRole('button', { name: 'ランチパッドに縮小' }).click();
    await expect(identity).toBeInViewport(); await expect(clock).toBeInViewport();
  });
}

test('expansion opens public discovery over the current room', async ({ page }, info) => {
  await page.route('**/rooms/browse', route => route.fulfill({ json: { rooms: [] } }));
  const { pad, url, messages } = await room(page);
  await pad.getByRole('button', { name: 'ゲームメニューを拡大' }).click();
  await expect(pad.getByRole('heading', { name: 'いまのぷぷりえーる', exact: true })).toBeVisible();
  await expect(pad.getByRole('tab', { name: 'ランチパッドホーム' })).toHaveCount(0);
  await expect(pad.getByRole('region', { name: 'クイックリンク' })).toHaveCount(0);
  await expect(pad.getByRole('complementary', { name: 'パブリックルーム一覧' })).toBeVisible();
  await expect(pad.getByRole('status')).toHaveText('パブリックルームがありません');
  const rail = pad.getByRole('tablist', { name: 'ゲームの画面', exact: true });
  const alignment = await rail.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll('button')).map(button => {
      const box = button.getBoundingClientRect(), icon = button.querySelector('svg').getBoundingClientRect(), label = button.querySelector('span').getBoundingClientRect();
      return { left: box.left - bounds.left, right: bounds.right - box.right, icon: icon.left + icon.width / 2 - (box.left + box.width / 2), label: label.left + label.width / 2 - (box.left + box.width / 2) };
    });
  });
  for (const item of alignment) {
    expect(item.left).toBeGreaterThanOrEqual(-1);
    expect(item.right).toBeGreaterThanOrEqual(-1);
    expect(Math.abs(item.icon)).toBeLessThan(1);
    expect(Math.abs(item.label)).toBeLessThan(1);
  }
  await pad.getByRole('button', { name: 'ルームを作る', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新しいルームを作る' })).toBeVisible();
  await page.keyboard.press('Escape');
  await pad.getByRole('tab', { name: 'カード', exact: true }).click();
  await expect(pad.getByRole('link', { name: /図鑑/ })).toBeVisible();
  await pad.getByRole('tab', { name: 'いまのぷぷりえーる', exact: true }).click();
  await expect(pad.getByRole('heading', { name: 'いまのぷぷりえーる', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('game-discover.png') });
  await pad.getByRole('tab', { name: 'リーサルパズル', exact: true }).click();
  await expect(pad.getByRole('heading', { name: 'リーサルパズル', exact: true })).toBeVisible();
  await expect(pad.getByText('ロリの一手を極めるために', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('puzzle-subtitle.png') });
  await pad.getByRole('tab', { name: 'いまのぷぷりえーる', exact: true }).click();
  await pad.getByRole('button', { name: 'ランチパッドに縮小' }).click();
  await expect(pad.getByRole('region', { name: 'クイックリンク' })).toBeVisible();
  await expect(page).toHaveURL(url);
  expect(messages.filter(message => message.type === 'hello')).toHaveLength(1);
});

test('social and puzzle subtitles align left, while hovered menu items keep their position', async ({ page }, info) => {
  const { pad } = await room(page);
  await page.addStyleTag({ content: '[data-launchpad] * { transition: none !important; animation: none !important; }' });
  const tile = pad.getByRole('region', { name: 'クイックリンク' }).getByRole('button', { name: 'ソーシャル', exact: true });
  const original = await tile.boundingBox();
  await tile.hover();
  expect(await tile.boundingBox()).toEqual(original);
  await tile.click();
  const panel = pad.getByRole('tabpanel');
  const social = panel.getByText('フレンドの現在地', { exact: true });
  await expect(social).toBeVisible();
  await expect(panel.locator('svg path[d^="M12 10a3.3"]')).toHaveCount(0);
  expect(await social.evaluate(element => ({ weight: getComputedStyle(element).fontWeight, align: getComputedStyle(element).textAlign, tag: element.tagName }))).toEqual({ weight: '400', align: 'left', tag: 'P' });
  await pad.getByRole('tab', { name: 'リーサルパズル', exact: true }).click();
  const subtitle = panel.getByText('ロリの一手を極めるために', { exact: true });
  await expect(subtitle).toBeVisible();
  expect(Math.abs((await subtitle.boundingBox()).x - (await panel.boundingBox()).x)).toBeLessThan(1);
  expect(await subtitle.evaluate(element => ({ weight: getComputedStyle(element).fontWeight, align: getComputedStyle(element).textAlign }))).toEqual({ weight: '400', align: 'left' });
  const puzzle = panel.getByRole('link').first();
  const position = await puzzle.boundingBox();
  await puzzle.hover();
  expect(await puzzle.boundingBox()).toEqual(position);
  await page.screenshot({ path: info.outputPath('puzzle-subtitle-static-hover.png') });
});
