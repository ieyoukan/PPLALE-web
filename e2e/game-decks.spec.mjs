import { test, expect } from '@playwright/test';

// ランチパッドのデッキ管理：ゲストのデッキ作成・保存・すぐ使うポップアップ・確認、席からの作成、英語表示。
const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app connected to a room server');
test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
test.setTimeout(90_000);

async function newDeck(page) {
  // The address leads to the room first; the menu opens over it once the room is there.
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  const pad = page.getByRole('dialog', { name: /^(ゲームメニュー|Game menu)$/ });
  await pad.getByRole('button', { name: /あたらしく作る|Make a new deck/ }).click();
  return pad;
}

test('a guest makes a deck by tapping and dragging, saves it in the browser and copies its codes at once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${base}/game/decks/`);
  const pad = await newDeck(page);
  await page.getByRole('button', { name: /^からっぽ/ }).click();
  await expect(page.getByRole('heading', { name: 'デッキ編成', exact: true })).toBeVisible();

  const pool = page.locator('[data-drop=pool]'), deck = page.locator('[data-drop=deck]');
  await pool.getByRole('button', { name: /を入れる$/ }).first().click();
  await pool.getByRole('button', { name: /を入れる$/ }).first().click();
  // Dragged from the list onto the deck.
  const from = await pool.getByRole('button', { name: /を入れる$/ }).nth(3).boundingBox(), to = await deck.boundingBox();
  await page.mouse.move(from.x + 20, from.y + 30); await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 }); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(deck.getByRole('button', { name: /をぬく$/ })).toHaveCount(3);
  await expect(deck.getByText('/ 20')).toBeVisible();
  // Dragged back out of the deck removes one.
  const slot = await deck.getByRole('button', { name: /をぬく$/ }).last().boundingBox(), list = await pool.boundingBox();
  await page.mouse.move(slot.x + 20, slot.y + 30); await page.mouse.down();
  await page.mouse.move(slot.x - 40, slot.y + 30, { steps: 4 }); await page.mouse.move(list.x + 100, list.y + 200, { steps: 8 }); await page.mouse.up();
  await expect(deck.getByRole('button', { name: /をぬく$/ })).toHaveCount(2);

  await page.getByRole('tab', { name: 'お菓子', exact: true }).click();
  await pool.getByRole('button', { name: /を入れる$/ }).nth(1).click();
  await expect(deck.getByRole('button', { name: /をぬく$/ })).toHaveCount(1);
  await page.getByRole('textbox', { name: 'デッキの名前' }).fill('テストのデッキ');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  // Back at the list, the deck's popup opens: codes, costs, the playable.
  const quick = page.getByRole('dialog', { name: 'テストのデッキ', exact: true });
  await expect(quick).toBeVisible();
  await quick.getByRole('button', { name: 'コピー', exact: true }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\d+,\d+$/);
  await quick.getByRole('button', { name: 'プレイアブルを変える' }).click();
  await quick.getByRole('group', { name: 'プレイアブルを選ぶ' }).getByRole('button').first().click();
  // Review & share returns to the popup when closed.
  await quick.getByRole('button', { name: '確認・共有' }).click();
  const review = page.getByRole('dialog', { name: 'テストのデッキ', exact: true });
  await expect(review.locator('[data-deck-card]')).toHaveCount(4);
  await review.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'テストのデッキ', exact: true }).getByRole('button', { name: '編成する' })).toBeVisible();
  await page.getByRole('dialog', { name: 'テストのデッキ', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(pad.getByRole('button', { name: 'テストのデッキ', exact: true })).toBeVisible();

  // Kept in this browser (the same place the site's guest decks use).
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('localDecks') ?? '[]').length)).toBe(1);
});

test('a deck made from the seat becomes the seat\'s deck', async ({ page }) => {
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/, { timeout: 30000 });
  await page.getByRole('button', { name: 'この席にすわる', exact: true }).first().click();
  await page.getByRole('button', { name: /^デッキ:/ }).first().click();
  await page.getByRole('button', { name: 'つくる', exact: true }).click();
  await page.getByRole('button', { name: /^おまかせ/ }).click();
  await page.getByRole('textbox', { name: 'デッキの名前' }).fill('席のデッキ');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'ゲームメニュー', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'デッキ: 席のデッキ', exact: true })).toBeVisible();
});

test.describe('in English', () => {
  test.use({ locale: 'en-US' });
  test('the deck screens, card names and texts follow the browser language', async ({ page }) => {
    await page.goto(`${base}/game/decks/`);
    await newDeck(page);
    await page.getByRole('button', { name: /^Empty/ }).click();
    await expect(page.getByRole('heading', { name: 'Deck editor', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Little girls', exact: true })).toBeVisible();
    await page.locator('[data-drop=pool]').getByRole('button', { name: /: enlarge$/ }).first().click();
    const text = page.getByRole('region', { name: 'Card text' });
    await expect(text).toContainText('Strawberry');
    await expect(text.getByRole('heading')).toHaveText(/[A-Za-z]/);
  });
});
