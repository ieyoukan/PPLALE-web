// Rooms between browsers: opening the game makes a room, its invitation link brings a friend in,
// both sit at the table, play the opening, one gives up, and after the match one keeps the seat
// and the other watches. The owner leaving lets someone else take the role. The CPU can be called
// to an empty seat and plays its own moves.
//
// Needs a room server and a web app that talks to it; this only runs when PPLALE_ROOM_TEST_URL
// names that web app, e.g.
//   PORT=8099 pnpm run start --workspace=@pplale/room-server
//   NEXT_PUBLIC_ROOM_SERVER_URL=http://localhost:8099 npx next dev -p 3100
//   PPLALE_ROOM_TEST_URL=http://localhost:3100 npx playwright test room-match
// (PPLALE_ROOM_SERVER_URL names the room server when it is not http://localhost:8099.)
import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');

const errors = [];
test.beforeEach(() => { errors.length = 0; });
async function open(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(guest => { try { localStorage.setItem('pplale-guest-name-v2', guest); } catch {} }, name);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  return page;
}
/** The room this browser is in, and the invitation it knows (the owner of an invite room sees it). */
const plazaOf = page => page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('pplale-plaza-v1'));
  return { id: saved.current, invite: saved.rooms[saved.current]?.invite };
});
/** Dice in order (seat 0 first) until someone may choose (a tie is thrown again); that one goes first. */
async function decideOrder(near, far) {
  let first;
  for (let round = 0; round < 8 && !first; round++) {
    await near.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    await far.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    first = await Promise.any([near, far].map(page => page.getByRole('button', { name: '決定' }).waitFor({ timeout: 9000 }).then(() => page))).catch(() => undefined);
  }
  expect(first).toBeDefined();
  await first.getByRole('radio', { name: '先攻' }).click();
  await first.getByRole('button', { name: '決定' }).click();
  return [first, first === near ? far : near];
}
const seats = page => page.getByRole('button', { name: 'この席にすわる' });

test('opening the game makes a room; its invitation brings a friend to the same table', async ({ browser }) => {
  test.setTimeout(150000);
  const alice = await open(browser, 'ありす'), bob = await open(browser, 'ぼぶ'), carol = await open(browser, 'きゃろる');

  // Opening the game: the launch screen, then a room of the default kind (invite) at its own address.
  await alice.goto(`${base}/game/`);
  await alice.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await expect(seats(alice)).toHaveCount(2);
  await expect(alice.getByRole('button', { name: /のメニュー$/ })).toContainText('インバイト');
  const { id, invite } = await plazaOf(alice);
  expect(invite).toBeTruthy();
  // Reloading comes back to the same room instead of making another.
  await alice.goto(`${base}/game/`);
  await alice.waitForURL(`${base}/game/room/${id}/`);

  // The invitation is pasted in Discord first.
  await alice.getByRole('button', { name: 'さそう' }).click();
  await expect(alice.getByRole('button', { name: /Discordに貼る/ })).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(alice.getByRole('button', { name: /Discordに貼る/ })).toHaveCount(0);

  // Without the invitation the room cannot be found: that is said, then carol is back in a room of
  // her own. With it, the friend comes straight in.
  await carol.goto(`${base}/game/room/${id}/`);
  await expect(carol.getByRole('status').filter({ hasText: '招待が必要です' })).toBeVisible();
  await carol.waitForURL(url => /\/game\/room\/\d{6}\/$/.test(url.pathname) && !url.pathname.includes(id), { timeout: 30000 });
  await bob.goto(`${base}/game/room/${id}/?invite=${invite}`);
  await bob.waitForURL(`${base}/game/room/${id}/`);
  await expect(bob.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(2);
  await expect(alice.getByRole('complementary', { name: 'ルームにいる人' })).toContainText('ぼぶ');

  // Both sit down and get ready: the match starts on the same page.
  // Seats are in seat order (0 at the table's left end): bob takes seat 1, so alice (seat 0) throws first.
  await seats(bob).last().click();
  await expect(seats(alice)).toHaveCount(1);
  await seats(alice).click();
  for (const page of [alice, bob]) await page.getByRole('button', { name: 'じゅんびOK!' }).click();
  for (const page of [alice, bob]) await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible({ timeout: 20000 });
  expect(alice.url()).toBe(`${base}/game/room/${id}/`);
  const [first] = await decideOrder(alice, bob);
  await expect(first.locator('button[data-deck$="-yojo"]:not([disabled])')).toBeVisible({ timeout: 15000 });

  // Giving up from the board's menu ends it for both.
  await first.getByRole('button', { name: 'メニュー', exact: true }).click();
  await first.getByRole('button', { name: '投了する' }).click();
  await first.getByRole('button', { name: '投了する（負けになります）' }).click();
  for (const page of [alice, bob]) await expect(page.getByRole('dialog', { name: '対戦結果' })).toBeVisible({ timeout: 20000 });

  // After it: alice keeps her seat for the next match, bob gives up his and watches.
  await alice.getByRole('button', { name: 'この席でもう一度' }).click();
  await bob.getByRole('button', { name: '席を空けて観戦' }).click();
  await expect(alice.getByRole('button', { name: 'じゅんびOK!' })).toBeVisible({ timeout: 15000 });
  await expect(seats(bob)).toHaveCount(1);

  // The owner leaves for a new room: bob stays, the room has no owner, and he takes the role.
  await alice.keyboard.press('Escape');
  await alice.getByRole('region', { name: 'クイックリンク' }).getByRole('button', { name: 'ルーム', exact: true }).click();
  await alice.getByRole('button', { name: 'ルームを作る', exact: true }).click();
  const creation = alice.getByRole('dialog', { name: '新しいルームを作る' });
  await expect(creation.getByRole('radio', { name: /^インバイト 招待/ })).toHaveAttribute('aria-checked', 'true');
  await expect(creation.getByRole('radio')).toHaveCount(5);
  await creation.getByRole('radio', { name: /パブリック/ }).click();
  await creation.getByRole('button', { name: 'この公開範囲で作る' }).click();
  await alice.waitForURL(url => /\/game\/room\/\d{6}\/$/.test(url.pathname) && !url.pathname.includes(id) && url.searchParams.get('created') === '1', { timeout: 30000 });
  const created = alice.getByRole('dialog', { name: 'ルームを作りました' });
  await expect(created).toContainText('パブリック');
  await expect(created.getByRole('img', { name: 'ルームのサムネイル' })).toBeVisible();
  await created.getByRole('button', { name: '名前を変える' }).click();
  await alice.getByRole('textbox', { name: 'ルーム名' }).fill('パブリックで遊ぼう');
  await alice.getByRole('button', { name: 'この名前にする' }).click();
  await expect(created).toContainText('パブリックで遊ぼう');
  await created.getByRole('button', { name: 'ルールを変える' }).click();
  await expect(alice.getByRole('dialog', { name: 'ルールをかえる' })).toBeVisible();
  await alice.getByRole('button', { name: 'このルールにする' }).click();
  await created.getByRole('button', { name: '共有リンク' }).click();
  await expect(alice.getByRole('dialog', { name: 'ルームにさそう' }).getByRole('button', { name: 'リンク' })).toBeVisible();
  await alice.getByRole('dialog', { name: 'ルームにさそう' }).getByRole('button', { name: '閉じる' }).click();
  await created.getByRole('button', { name: '盤面へ' }).click();
  await alice.waitForURL(url => /\/game\/room\/\d{6}\/$/.test(url.pathname) && !url.pathname.includes(id) && !url.search);
  await expect(bob.getByRole('complementary', { name: 'ルームにいる人' }).getByRole('listitem')).toHaveCount(1);
  await bob.getByRole('button', { name: 'オーナーになる' }).click();
  await expect(bob.getByText('あなたがオーナー')).toBeVisible();
  expect(errors).toEqual([]);
  for (const page of [alice, bob, carol]) await page.context().close();
});

test('the CPU plays at the same table, with spectators joining before and during the match', async ({ browser }) => {
  test.setTimeout(120000);
  const alice = await open(browser, 'ありす');
  await alice.goto(`${base}/game/`);
  await alice.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await seats(alice).last().click();
  await alice.getByRole('button', { name: '対戦相手をえらぶ' }).click();
  await alice.getByRole('dialog', { name: '対戦相手をえらぶ' }).getByRole('button', { name: '人をさそう' }).click();
  await expect(alice.getByRole('dialog', { name: 'ルームにさそう' })).toBeVisible();
  await alice.getByRole('dialog', { name: 'ルームにさそう' }).getByRole('button', { name: '閉じる' }).click();
  await alice.getByRole('button', { name: '対戦相手をえらぶ' }).click();
  await alice.getByRole('dialog', { name: '対戦相手をえらぶ' }).getByRole('button', { name: 'CPUと対戦' }).click();
  await expect(alice.getByRole('dialog', { name: 'CPUをえらぶ' })).toBeVisible();
  await alice.getByRole('button', { name: /ふつう/ }).click();
  await expect(alice.getByRole('button', { name: /CPUのデッキをえらぶ/ })).toContainText('おまかせデッキ');
  await alice.getByRole('button', { name: /CPUのデッキをえらぶ/ }).click();
  const picker = alice.getByRole('dialog', { name: 'デッキをえらぶ' });
  await picker.getByRole('button').filter({ hasText: 'いちごのおためしデッキ' }).click();
  await expect(alice.getByRole('group', { name: 'デッキのカード' })).toBeVisible();
  await alice.getByRole('button', { name: 'このデッキにする' }).click();
  await alice.getByRole('button', { name: 'このCPUを呼ぶ' }).click();
  await expect(alice.getByText('CPU・ふつう')).toBeVisible();
  // Reconfigure the same CPU from its own seat, without removing it first.
  await alice.getByRole('button', { name: /^CPUのデッキ:/ }).click();
  await expect(alice.getByRole('button', { name: /CPUのデッキをえらぶ/ })).toContainText('いちごのおためしデッキ');
  await alice.getByRole('button', { name: 'このCPUにする' }).click();
  const { id, invite } = await plazaOf(alice);
  const bob = await open(browser, '観戦するぼぶ');
  await bob.goto(`${base}/game/room/${id}/?invite=${invite}`);
  await expect(bob.getByText('CPU・ふつう', { exact: true })).toBeVisible();
  await expect(bob.getByRole('button', { name: 'じゅんびOK!', exact: true })).toHaveCount(0);
  await alice.getByRole('button', { name: 'じゅんびOK!' }).click();
  for (const page of [alice, bob]) await expect(page.locator('[data-table]')).toBeVisible({ timeout: 20000 });
  // The CPU throws its die after ours; whoever wins chooses.
  for (let round = 0; round < 8; round++) {
    await alice.getByRole('button', { name: 'あなたのサイコロを振る' }).click({ timeout: 20000 });
    const next = await Promise.race([
      alice.getByRole('button', { name: '決定' }).waitFor({ timeout: 12000 }).then(() => 'choose'),
      alice.locator('button[data-deck$="-yojo"]:not([disabled])').waitFor({ timeout: 12000 }).then(() => 'draw'),
    ]).catch(() => 'again');
    if (next === 'choose') { await alice.getByRole('radio', { name: '先攻' }).click(); await alice.getByRole('button', { name: '決定' }).click(); }
    if (next !== 'again') break;
  }
  // The CPU draws its opening hand by itself.
  await expect.poll(() => alice.locator('[aria-label^="相手の手札"]').getAttribute('aria-label'), { timeout: 20000 }).toMatch(/[1-9]枚/);
  // A late visitor joins the running match without taking a seat or seeing either private hand.
  const carol = await open(browser, '途中から観戦するきゃろる');
  await carol.goto(`${base}/game/room/${id}/?invite=${invite}`);
  for (const page of [bob, carol]) {
    await expect(page.locator('[data-table]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-hand-list] [data-hand]').first()).toBeDisabled();
    await expect(page.locator('[data-hand-list] [data-hand] img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '観戦中', exact: true })).toBeDisabled();
  }
  await alice.keyboard.press('Escape');
  await alice.getByRole('dialog', { name: 'ゲームメニュー' }).getByRole('button', { name: 'ホーム', exact: true }).click();
  const home = alice.getByRole('dialog', { name: 'ホームへ移動しますか？', exact: true });
  await expect(home).toContainText('対戦中の試合は負けになります');
  await home.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(alice).toHaveURL(`${base}/game/room/${id}/`);
  await alice.getByRole('dialog', { name: 'ゲームメニュー' }).getByRole('button', { name: 'ホーム', exact: true }).click();
  await home.getByRole('button', { name: '移動する', exact: true }).click();
  await alice.waitForURL(target => /^\/game\/room\/\d{6}\/$/.test(target.pathname) && !target.pathname.includes(id));
  for (const page of [bob, carol]) {
    await expect(page).toHaveURL(`${base}/game/room/${id}/`);
    await expect(page.getByRole('dialog', { name: '対戦結果', exact: true })).toBeVisible({ timeout: 20000 });
  }
  expect(errors).toEqual([]);
  for (const page of [alice, bob, carol]) await page.context().close();
});

test('a link to an older two-seat room opens its lobby, where joining is the visitor\'s choice', async ({ browser }) => {
  test.setTimeout(60000);
  const server = process.env.PPLALE_ROOM_SERVER_URL ?? 'http://localhost:8099';
  const made = await (await fetch(`${server}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { fruits: ['strawberry'], extendedPlayable: false }, name: 'ほすと' }) })).json();
  const visitor = await open(browser, 'げすと');
  await visitor.goto(`${base}/game/battle/room/?id=${made.view.id}`);
  await visitor.waitForURL(`${base}/game/room/${made.view.id}/?id=${made.view.id}`);
  await expect(visitor.getByRole('button', { name: 'このルームに入る' })).toBeVisible({ timeout: 20000 });
  // Nobody took the seat on the visitor's behalf.
  const info = await (await fetch(`${server}/rooms/${made.view.id}`)).json();
  expect(info.open).toBe(true);
  expect(errors).toEqual([]);
  await visitor.context().close();
});
