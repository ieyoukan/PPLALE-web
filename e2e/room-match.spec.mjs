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

test('two players meet in a room, play the opening and one gives up', async ({ browser }) => {
  test.setTimeout(120000);
  const errors = [];
  const open = async name => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    return page;
  };
  const host = await open('host'), guest = await open('guest');

  // The host makes a room; only what the game can play is selectable.
  await host.goto(`${base}/game/battle/`);
  await expect(host.getByText('ルームサーバー：稼働中')).toBeVisible();
  await host.getByRole('button', { name: /ルームを作る/ }).click();
  await expect(host.getByRole('checkbox', { name: /いちご/ })).toBeChecked();
  await expect(host.getByRole('checkbox', { name: /ぶどう/ })).toBeDisabled();
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

  // Dice in order (the host first) until someone may choose; a tie is thrown again.
  let first, second;
  for (let round = 0; round < 8 && !first; round++) {
    await host.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    await guest.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    first = await Promise.any([host, guest].map(page => page.getByRole('button', { name: '決定' }).waitFor({ timeout: 9000 }).then(() => page))).catch(() => undefined);
  }
  expect(first).toBeDefined();
  second = first === host ? guest : host;
  await first.getByRole('radio', { name: '先攻' }).click();
  await first.getByRole('button', { name: '決定' }).click();

  // Both draw their opening hands at the same time, then keep them.
  const draw = async (page, count) => {
    for (let i = 0; i < count; i++) {
      await page.locator('button[data-deck$="-yojo"]:not([disabled])').click({ timeout: 15000 });
      await page.waitForTimeout(350);
    }
  };
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
