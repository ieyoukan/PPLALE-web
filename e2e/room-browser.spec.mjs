import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
const server = process.env.PPLALE_ROOM_SERVER_URL ?? 'http://localhost:8099';
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');
test.use({ reducedMotion: 'reduce' });

async function create(name, visibility = 'public', rules = { fruits: ['strawberry'], extendedPlayable: false }) {
  const response = await fetch(`${server}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '作成者さん', rules, plaza: { name, visibility } }) });
  expect(response.ok).toBe(true);
  return (await response.json()).view;
}

async function openBrowser(page, expand = false) {
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  const roomURL = page.url();
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const pad = page.getByRole('dialog', { name: 'ゲームメニュー' });
  if (expand) await pad.getByRole('button', { name: 'ゲームメニューを拡大', exact: true }).click();
  else await pad.getByRole('region', { name: 'クイックリンク' }).getByRole('button', { name: 'ルーム', exact: true }).click();
  await expect(pad.getByRole('tab', { name: 'いまのぷぷりえーる', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(pad.getByRole('tab', { name: 'ルーム', exact: true })).toHaveCount(0);
  return { pad, roomURL, list: pad.getByRole('complementary', { name: 'パブリックルーム一覧' }), detail: pad.getByRole('region', { name: '選択したルーム' }) };
}

test('the launchpad browses public rooms beside their details, filters rules and enters the selected room', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const strawberry = await create('いちごのお茶会');
  const grape = await create('ぶどうのお茶会', 'public', { fruits: ['strawberry', 'grape'], extendedPlayable: true, turnSeconds: 120 });
  const privateRoom = await create('見えない秘密のお茶会', 'invite');
  const { pad, roomURL, list, detail } = await openBrowser(page, true);
  await expect(list.getByRole('button', { name: `いちごのお茶会 #${strawberry.id}`, exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: `ぶどうのお茶会 #${grape.id}`, exact: true })).toBeVisible();
  await expect(list.getByText(privateRoom.plaza.name)).toHaveCount(0);
  await list.getByRole('button', { name: `ぶどうのお茶会 #${grape.id}`, exact: true }).click();
  await expect(detail.getByRole('heading', { name: 'ぶどうのお茶会', exact: true })).toBeVisible();
  await expect(detail).toContainText('作成者さん');
  await expect(detail.getByLabel('ルームのルール')).toContainText('ぶどうまで拡張あり2分');
  const listBox = await list.boundingBox(), detailBox = await detail.boundingBox();
  expect(listBox.x).toBeGreaterThanOrEqual(detailBox.x + detailBox.width);
  const picture = await detail.getByRole('img', { name: 'ルームのサムネイル' }).boundingBox();
  expect(picture.width / picture.height).toBeCloseTo(800 / 420, 2);
  await expect(page).toHaveURL(roomURL);
  await pad.getByRole('button', { name: '絞り込み', exact: true }).click();
  await pad.getByRole('combobox', { name: 'フルーツ', exact: true }).selectOption('grape');
  await expect(list.getByRole('button', { name: `いちごのお茶会 #${strawberry.id}`, exact: true })).toHaveCount(0);
  await expect(list.getByRole('button', { name: `ぶどうのお茶会 #${grape.id}`, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('room-browser-desktop.png') });
  await detail.getByRole('button', { name: '入る', exact: true }).click();
  await page.waitForURL(`${base}/game/room/${grape.id}/`);
  await expect(pad).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ぶどうのお茶会.*のメニュー/ })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test(`the room list scrolls, refreshes and opens creation at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    let fail = false, removed = false;
    const rooms = Array.from({ length: 40 }, (_, index) => ({
      id: String(800000 + index), status: 'lobby', rules: { fruits: ['strawberry'], extendedPlayable: false }, host: '作成者', open: true, spectators: true,
      plaza: { name: `おやつのルーム${index}`, visibility: 'public', creator: { name: '作成者' }, members: index % 8 + 1, seated: index % 3 },
    }));
    // Even enterable friends/invite rooms (including our current one) belong outside public discovery.
    const privateRooms = ['friends', 'friendsPlus', 'invite', 'invitePlus'].map((visibility, index) => ({ ...rooms[0], id: String(900000 + index), plaza: { ...rooms[0].plaza, name: `限定ルーム${index}`, visibility } }));
    await page.route('**/rooms/browse', route => route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: '一覧の接続テスト' } : { rooms: [...(removed ? rooms.slice(0, -1) : rooms), ...privateRooms] } }));
    const { pad, roomURL, list, detail } = await openBrowser(page);
    await expect(list.getByRole('button')).toHaveCount(40);
    await expect(list.getByText(/限定ルーム/)).toHaveCount(0);
    const currentId = new URL(roomURL).pathname.split('/').filter(Boolean).at(-1);
    expect(await list.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).not.toEqual(expect.arrayContaining([expect.stringContaining(`#${currentId}`)]));
    await list.getByRole('button', { name: 'おやつのルーム39 #800039', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(() => list.getByRole('list').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await list.getByRole('button', { name: 'おやつのルーム39 #800039', exact: true }).click();
    await expect(detail.getByRole('heading', { name: 'おやつのルーム39', exact: true })).toBeVisible();
    expect(await pad.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(detail.getByRole('button', { name: '入る', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('room-browser.png') });
    fail = true;
    await pad.getByRole('button', { name: 'ルーム一覧を更新', exact: true }).click();
    await expect(pad.getByRole('alert')).toHaveText('一覧の接続テスト');
    fail = false; removed = true;
    await pad.getByRole('button', { name: 'ルーム一覧を更新', exact: true }).click();
    await expect(list.getByRole('button')).toHaveCount(39);
    await expect(detail.getByRole('heading', { name: 'おやつのルーム0', exact: true })).toBeVisible();
    await expect(pad.getByRole('alert')).toHaveCount(0);
    await pad.getByRole('button', { name: 'ルームを作る', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '新しいルームを作る', exact: true }).getByRole('radio')).toHaveCount(5);
    await expect(page).toHaveURL(roomURL);
  });
}

test('public discovery has an empty state and keeps friend locations in Social', async ({ page }) => {
  await page.route('**/rooms/browse', route => route.fulfill({ json: { rooms: [] } }));
  const { pad, roomURL, list } = await openBrowser(page, true);
  await expect(pad.getByRole('status')).toHaveText('パブリックルームがありません');
  await expect(list.getByRole('button')).toHaveCount(0);
  await pad.getByRole('tab', { name: 'ソーシャル', exact: true }).click();
  await expect(pad.getByText('フレンドの現在地', { exact: true })).toBeVisible();
  await expect(pad.getByRole('complementary', { name: 'パブリックルーム一覧' })).toHaveCount(0);
  await pad.getByRole('tab', { name: 'いまのぷぷりえーる', exact: true }).click();
  await pad.getByRole('button', { name: 'ルームを作る', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新しいルームを作る', exact: true })).toBeVisible();
  await expect(page).toHaveURL(roomURL);
});
