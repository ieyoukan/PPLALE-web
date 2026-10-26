import { test, expect } from '@playwright/test';
import problems from '../src/data/lethalPuzzles.json' with { type: 'json' };
import previews from '../src/data/lethalPuzzlePreviews.json' with { type: 'json' };

test.use({ reducedMotion: 'reduce' });
const toolbar = page => page.getByRole('toolbar', { name: 'リーサルパズル', exact: true });
const endTurn = page => page.getByRole('button', { name: /ターン\s*終了/ });

test('all 25 puzzles open from their fruit groups and keep the saved match intact', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/game/puzzles/');
  await expect(page.getByRole('heading', { name: 'ロリの一手を極めるために', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /リーサルパズル/ })).toHaveAttribute('aria-current', 'page');
  expect(await page.locator('main').innerText()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  for (const [fruit, label] of [['strawberry', 'イチゴ'], ['grape', 'ぶどう'], ['melon', 'メロン']]) {
    const group = problems.filter(problem => problem.fruit === fruit);
    await page.getByRole('navigation', { name: 'パズルのフルーツ' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page.locator('[data-puzzle-preview]')).toHaveCount(group.length);
    for (const difficulty of ['初級', '中級', '上級']) await expect(page.getByRole('heading', { name: `${label} ${difficulty}`, exact: true })).toBeVisible();
    for (const problem of group) {
      const preview = page.locator(`[data-puzzle-preview="${problem.id}"]`);
      await expect(preview.getByRole('img')).toHaveAttribute('src', previews.puzzles[problem.id].src);
      await preview.scrollIntoViewIfNeeded();
      await expect.poll(() => preview.getByRole('img').evaluate(image => image.complete && image.naturalWidth === 1280 && image.naturalHeight === 720)).toBe(true);
    }
  }
  await page.evaluate(() => localStorage.setItem('pplale-game-session-v2', 'existing match'));
  for (const problem of problems) {
    await page.goto(`/game/puzzle/?id=${problem.id}`);
    const title = JSON.parse(Buffer.from(problem.code.slice(5), 'base64url').toString()).title;
    await expect(toolbar(page)).toContainText(title, { timeout: 20000 });
    await expect(toolbar(page).getByRole('button', { name: '一手戻す', exact: true })).toHaveText(/戻す/);
    await expect(toolbar(page).getByRole('button', { name: '最初からやり直す', exact: true })).toHaveText(/やり直す/);
    await expect(toolbar(page).getByRole('button', { name: '問題一覧へ', exact: true })).toHaveText('一覧');
    await expect(endTurn(page)).toBeEnabled();
    await expect(page.locator('[data-hand-list] [data-hand]')).not.toHaveCount(0);
    await expect(page.getByRole('button', { name: '相手の非公開手札', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '✎ 編集', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '問題一覧へ', exact: true }).click();
    await expect(page).toHaveURL(/\/game\/puzzles\//);
    expect(new URL(page.url()).searchParams.get('fruit')).toBe(problem.fruit);
    await expect(page.locator(`[data-puzzle-preview="${problem.id}"]`)).toBeVisible();
  }
  expect(await page.evaluate(() => localStorage.getItem('pplale-game-session-v2'))).toBe('existing match');
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/game/puzzles/?fruit=melon');
  await page.screenshot({ path: '/tmp/pplale-puzzle-list-desktop.png' });
});

test('fruit selection survives reload and fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game/puzzles/');
  await expect(page.locator('[data-puzzle-preview]')).toHaveCount(6);
  const fruits = page.getByRole('navigation', { name: 'パズルのフルーツ' });
  await fruits.getByRole('link', { name: 'メロン', exact: true }).click();
  await expect(page.locator('[data-puzzle-preview]')).toHaveCount(13);
  await page.reload();
  await expect(fruits.getByRole('link', { name: 'メロン', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-puzzle-preview]')).toHaveCount(13);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/pplale-puzzle-list-mobile.png' });
  await page.goto('/game/puzzles/?fruit=unknown');
  await expect(fruits.getByRole('link', { name: 'イチゴ', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-puzzle-preview]')).toHaveCount(6);
});

test('failed turn can be undone or restarted on a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/game/puzzle/?id=melon-beginner-1');
  await expect(toolbar(page)).toBeVisible();
  await endTurn(page).click();
  const result = page.getByRole('dialog', { name: 'もう一度挑戦', exact: true });
  await expect(result).toBeVisible({ timeout: 15000 });
  await result.getByRole('button', { name: '一手戻す', exact: true }).click();
  await expect(result).toBeHidden();
  await expect(endTurn(page)).toBeEnabled();
  await page.getByRole('button', { name: '最初からやり直す', exact: true }).click();
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(8);
  expect(await page.evaluate(() => localStorage.getItem('pplale-lethal-cleared-v1'))).toBeNull();
  await page.screenshot({ path: '/tmp/pplale-puzzle-small.png' });
});

test('winning records a clear and the next-problem link starts a fresh puzzle', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/game/puzzle/?id=melon-beginner-1');
  await expect(endTurn(page)).toBeEnabled();
  const unit = page.locator('[data-side="0"][data-unit="c1"]');
  async function use(uid, action = '使う') {
    await expect(endTurn(page)).toBeEnabled();
    await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
    await page.getByRole('button', { name: action, exact: true }).click();
  }
  async function target() {
    await expect(unit).toHaveClass(/targetable/);
    await unit.click();
  }
  await use('c1', '場に出す');
  await expect(endTurn(page)).toBeEnabled();
  await page.getByRole('button', { name: 'あなたのスキル', exact: true }).click();
  await page.getByRole('button', { name: /後で返すからそのお菓子ちょうだい/ }).click();
  for (const uid of ['c2', 'c4', 'c3']) { await use(uid); await target(); }
  for (const [uid, discard] of [['c5', 'c6'], ['c8', 'c7']]) {
    await use(uid);
    const hand = page.locator(`[data-hand-list] [data-hand="${discard}"]`);
    await expect(hand).toHaveClass(/targetable/);
    await hand.click();
    await target();
  }
  for (let i = 0; i < 2; i++) {
    await expect(endTurn(page)).toBeEnabled();
    await unit.click();
    await page.locator('[data-leader="1"]').getByRole('button', { name: /^お菓子ポイント \d+$/ }).click();
  }
  const result = page.getByRole('dialog', { name: 'パズルクリア', exact: true });
  await expect(result).toBeVisible();
  await expect(result.getByRole('link', { name: /次の問題へ/ })).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pplale-lethal-cleared-v1')))).toEqual(['melon-beginner-1']);
  await result.getByRole('link', { name: /次の問題へ/ }).click();
  await expect(toolbar(page)).toContainText('メロン初級②');
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(9);
  await page.getByRole('button', { name: '問題一覧へ', exact: true }).click();
  await expect(page.getByRole('link', { name: 'メロン初級① クリア済み', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'メロン初級① クリア済み', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/pplale-puzzle-list.png' });
});

test('an unknown problem provides a way back', async ({ page }) => {
  await page.goto('/game/puzzle/?id=unknown');
  await expect(page.getByText('このパズルは見つかりませんでした。')).toBeVisible();
  await page.getByRole('link', { name: '問題一覧へ' }).click();
  await expect(page).toHaveURL(/\/game\/puzzles\//);
});

test('puzzle decks show grouped contents and inspection does not consume a pending draw', async ({ page }) => {
  await page.goto('/game/puzzle/?id=melon-intermediate-1');
  await expect(endTurn(page)).toBeEnabled();
  const panel = page.getByRole('complementary', { name: 'メニュー', exact: true });
  const inspectYojo = page.getByRole('button', { name: 'あなたの幼女デッキの中身を見る（2枚）', exact: true });
  const close = () => page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
  await inspectYojo.click();
  await expect(panel.getByRole('heading', { name: '幼女デッキ（2枚）', exact: true })).toBeVisible();
  await expect(panel.getByRole('button')).toHaveCount(1);
  await expect(panel.getByRole('button')).toHaveAccessibleName(/2枚$/);
  await panel.getByRole('button').click();
  await expect(panel.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await close();
  await page.locator('[data-deck="1-sweet"]').click();
  await expect(panel.getByRole('heading', { name: 'お菓子デッキ（0枚）', exact: true })).toBeVisible();
  await expect(panel.getByRole('button')).toHaveCount(0);
  await close();
  // いちごパフェ: spend one card, then choose two decks to draw from.
  await page.locator('[data-hand-list] [data-hand="c6"]').click();
  await page.getByRole('button', { name: '使う', exact: true }).click();
  await expect(page.locator('[data-deck="0-yojo"]')).toHaveClass(/drawReady/);
  await inspectYojo.click();
  await expect(panel.getByRole('heading', { name: '幼女デッキ（2枚）', exact: true })).toBeVisible();
  await close();
  await expect(inspectYojo).toBeVisible();
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(8);
  await page.locator('[data-deck="0-yojo"] [data-stack]').click();
  await expect(page.getByRole('button', { name: 'あなたの幼女デッキの中身を見る（1枚）', exact: true })).toBeVisible();
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(9);
});

test('deck count stays clickable above a large hand on desktop and small landscape screens', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/game/puzzle/?id=grape-advanced-1');
    await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(10);
    const count = page.getByRole('button', { name: 'あなたの幼女デッキの中身を見る（0枚）', exact: true });
    await expect(count).toBeVisible();
    await page.screenshot({ path: `/tmp/pplale-deck-count-${width}.png` });
    await count.click({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '幼女デッキ（0枚）', exact: true })).toBeVisible();
  }
});
