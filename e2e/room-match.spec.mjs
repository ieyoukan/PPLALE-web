// A room match between two browsers: create, invite, join, both ready, the opening, a turn, giving up.
//
// Needs a room server and a web app that talks to it; this only runs when PPLALE_ROOM_TEST_URL
// names that web app, e.g.
//   PORT=8099 npm run start --workspace=@pplale/room-server
//   NEXT_PUBLIC_ROOM_SERVER_URL=http://localhost:8099 npx next dev -p 3100
//   PPLALE_ROOM_TEST_URL=http://localhost:3100 npx playwright test room-match
import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');

const errors = [];
test.beforeEach(() => { errors.length = 0; });
async function open(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  return page;
}
/** Dice in order (the host first) until someone may choose (a tie is thrown again); that one goes first. */
async function decideOrder(host, guest) {
  let first;
  for (let round = 0; round < 8 && !first; round++) {
    await host.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    await guest.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    first = await Promise.any([host, guest].map(page => page.getByRole('button', { name: '決定' }).waitFor({ timeout: 9000 }).then(() => page))).catch(() => undefined);
  }
  expect(first).toBeDefined();
  await first.getByRole('radio', { name: '先攻' }).click();
  await first.getByRole('button', { name: '決定' }).click();
  return [first, first === host ? guest : host];
}
async function draw(page, count) {
  for (let i = 0; i < count; i++) {
    await page.locator('button[data-deck$="-yojo"]:not([disabled])').click({ timeout: 15000 });
    await page.waitForTimeout(350);
  }
}

test('two players meet in a room, play the opening and one gives up', async ({ browser }) => {
  test.setTimeout(120000);
  const host = await open(browser, 'host'), guest = await open(browser, 'guest');

  // The host makes a room; only what the game can play is selectable.
  await host.goto(`${base}/game/battle/`);
  await expect(host.getByText('ルームマッチを利用できます')).toBeVisible();
  await host.getByRole('button', { name: /ルームを作る/ }).click();
  await expect(host.getByRole('checkbox', { name: /いちご/ })).toBeChecked();
  await expect(host.getByRole('checkbox', { name: /ぶどう/ })).toBeEnabled();
  await expect(host.getByRole('checkbox', { name: /おれんじ/ })).toBeEnabled();
  await expect(host.getByRole('checkbox', { name: /めろん/ })).toBeDisabled();
  await expect(host.getByRole('checkbox', { name: /拡張プレイアブル/ })).not.toBeChecked();
  await host.getByPlaceholder('なまえ').fill('ほすと');
  await host.getByRole('button', { name: 'このルールでルームを作る' }).click();
  await host.waitForURL(/battle\/room\/\?id=\d{6}/);
  const id = new URL(host.url()).searchParams.get('id');
  const post = await host.getByRole('link', { name: 'Xで募集' }).getAttribute('href');
  expect(post).toContain('https://x.com/intent/post?');
  expect(decodeURIComponent(post)).toContain(`ルームID：${id}`);

  // The guest types the id, sees whose room it is, and joins.
  await guest.goto(`${base}/game/battle/`);
  await guest.getByRole('button', { name: /ルームへ入る/ }).click();
  await guest.getByPlaceholder('000000').fill(id);
  await guest.getByRole('button', { name: 'ルームを見る' }).click();
  await expect(guest.getByRole('heading', { name: 'ほすとさんのルーム' })).toBeVisible();
  await guest.getByPlaceholder('なまえ').fill('げすと');
  await guest.getByRole('button', { name: 'このルームに入る' }).click();
  await guest.getByRole('button', { name: 'このデッキで準備OK' }).click();
  await expect(host.getByText('げすと', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'このデッキで準備OK' }).click();
  await Promise.all([host, guest].map(page => page.waitForURL(/\/game\/room\/\?id=/)));

  const [first, second] = await decideOrder(host, guest);

  // Both draw their opening hands at the same time, then keep them.
  await Promise.all([draw(first, 3), draw(second, 4)]);
  await Promise.all([first, second].map(page => page.getByRole('button', { name: '交換せずに決定' }).click({ timeout: 15000 })));

  // Each side sees its own hand and only the backs of the other's.
  await expect(first.locator('[data-hand-list] [data-hand]')).toHaveCount(3, { timeout: 20000 });
  const theirs = first.getByRole('group', { name: '相手の手札 4枚' });
  await expect(theirs.locator('[data-hand]')).toHaveCount(4);
  await expect(theirs.locator('img')).toHaveCount(0);
  await expect(second.getByRole('button', { name: /相手の\s*ターン/ })).toBeDisabled();

  // A reload returns to the same seat.
  await second.reload();
  await expect(second.locator('[data-hand-list] [data-hand]')).toHaveCount(4, { timeout: 20000 });

  // Giving up ends the match for both; "once more" takes both back to choosing decks.
  await second.getByRole('button', { name: 'メニュー' }).click();
  await second.getByRole('button', { name: '投了する', exact: true }).click();
  await second.getByRole('button', { name: /投了する（/ }).click();
  for (const page of [first, second]) await expect(page.getByRole('dialog', { name: '対戦結果' }).getByText(/が投了した/)).toBeVisible({ timeout: 20000 });
  await first.getByRole('button', { name: /もう一度/ }).click();
  for (const page of [first, second]) await expect(page.getByRole('button', { name: 'このデッキで準備OK' })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
});

test('a room that allows it can be watched: the spectator sees both hands and cannot act', async ({ browser }) => {
  test.setTimeout(120000);
  const host = await open(browser, 'host'), guest = await open(browser, 'guest'), watcher = await open(browser, 'watcher');
  await host.goto(`${base}/game/battle/`);
  await host.getByRole('button', { name: /ルームを作る/ }).click();
  await host.getByRole('checkbox', { name: '観戦を許可する' }).check();
  await host.getByPlaceholder('なまえ').fill('ほすと');
  await host.getByRole('button', { name: 'このルールでルームを作る' }).click();
  await host.waitForURL(/battle\/room\/\?id=\d{6}/);
  const id = new URL(host.url()).searchParams.get('id');
  await expect(host.getByText(/観戦：あり/)).toBeVisible();

  // Someone comes to watch before there is a match.
  await watcher.goto(`${base}/game/battle/`);
  await watcher.getByRole('button', { name: /観戦する/ }).click();
  await watcher.getByPlaceholder('000000').fill(id);
  await watcher.getByRole('button', { name: '観戦する', exact: true }).click();
  await expect(watcher.getByRole('heading', { name: '対戦が始まるのを待っています' })).toBeVisible();
  await expect(host.getByText('いま1人が観戦しています。')).toBeVisible();

  await guest.goto(host.url());
  await guest.getByPlaceholder('なまえ').fill('げすと');
  await guest.getByRole('button', { name: 'このルームに入る' }).click();
  await guest.getByRole('button', { name: 'このデッキで準備OK' }).click();
  await host.getByRole('button', { name: 'このデッキで準備OK' }).click();
  const [first, second] = await decideOrder(host, guest);
  await Promise.all([draw(first, 3), draw(second, 4)]);

  // The spectator sees the cards of both hands (the players only the backs of the other's), and has nothing to press.
  await expect(watcher.locator('[data-table]')).toBeVisible();
  await expect(watcher.locator('[data-hand-list] [data-hand] img').first()).toBeVisible({ timeout: 20000 });
  await expect(watcher.locator('[role=group][aria-label^="相手の手札"] img').first()).toBeAttached();
  await expect(first.locator('[role=group][aria-label^="相手の手札"] img')).toHaveCount(0);
  await expect(watcher.getByRole('button', { name: '観戦中' })).toBeDisabled();
  await expect(watcher.locator('button[data-deck]:not([disabled])[data-deck$="-yojo"]')).toHaveCount(0);
  await expect(first.getByText('観戦 1人')).toBeVisible();
  expect(errors).toEqual([]);
});
