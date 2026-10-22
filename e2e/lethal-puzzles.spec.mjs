import { test, expect } from '@playwright/test';
import problems from '../src/data/lethalPuzzles.json' with { type: 'json' };
import previews from '../src/data/lethalPuzzlePreviews.json' with { type: 'json' };

test.use({ reducedMotion: 'reduce' });
const toolbar = page => page.getByRole('toolbar', { name: 'リーサルパズル', exact: true });
const endTurn = page => page.getByRole('button', { name: /ターン\s*終了/ });

test('all seven puzzles open from the menu and keep the saved match intact', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/game/puzzles/');
  await expect(page.getByRole('heading', { name: 'リーサルパズル', exact: true })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  await expect(page.locator('[data-puzzle-preview]')).toHaveCount(7);
  for (const problem of problems) {
    const preview = page.locator(`[data-puzzle-preview="${problem.id}"]`);
    await expect(preview.getByRole('img')).toHaveAttribute('src', previews.puzzles[problem.id].src);
    await preview.scrollIntoViewIfNeeded();
    await expect.poll(() => preview.getByRole('img').evaluate(image => image.complete && image.naturalWidth === 1280 && image.naturalHeight === 720)).toBe(true);
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
  }
  expect(await page.evaluate(() => localStorage.getItem('pplale-game-session-v2'))).toBe('existing match');
  expect(errors).toEqual([]);
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
