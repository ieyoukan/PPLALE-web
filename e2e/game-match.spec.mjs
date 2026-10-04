import { test, expect } from '@playwright/test';
import { arena, field, hand } from '../packages/game-core/tests/helpers.mjs';

const url = process.env.PPLALE_GAME_TEST_URL ?? 'http://localhost:3000/game/';
const storageKey = 'pplale-game-session-v2';
const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, storageKey);

async function loadBoard(page, game, mode = 'hotseat') {
  game.players[0].name = 'あなた';
  game.players[1].name = mode === 'cpu' ? 'CPU' : '相手';
  // Store the match from the game menu, then open the board, which loads it.
  await page.goto(url);
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(({ game, mode, key }) => localStorage.setItem(key, JSON.stringify({ game, mode, level: 'easy' })), { game, mode, key: storageKey });
  await page.goto(new URL('play/', url).href);
  await expect(page.locator('[data-table]')).toBeVisible();
  await expect.poll(async () => (await savedGame(page)).phase).toBe('playing');
}

async function useSweet(page, uid) {
  await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
  await page.getByRole('button', { name: '使う', exact: true }).click();
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}px match controls`, () => {
    test.use({ viewport });

    test('guard restricts attack targets; a sweet removes it, then an attack wins', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const s = arena({ me: { field: ['y_20'], hand: ['s_6'] }, foe: { field: ['y_8', 'y_9'], points: 4 } });
      const attacker = field(s)[0], [guard, ordinary] = field(s, 1);
      await loadBoard(page, s);
      await page.locator(`[data-unit="${attacker}"]`).click();
      await expect(page.locator(`[data-unit="${guard}"]`)).toBeEnabled();
      await expect(page.locator(`[data-unit="${ordinary}"]`)).toBeDisabled();
      await page.getByRole('button', { name: '戻す ↶' }).click();
      await useSweet(page, hand(s)[0]);
      await expect(page.locator(`[data-unit="${ordinary}"]`)).toHaveClass(/targetable/);
      await page.locator(`[data-unit="${guard}"]`).click();
      await expect.poll(async () => (await savedGame(page)).players[1].field.includes(guard)).toBe(false);
      await page.locator(`[data-unit="${attacker}"]`).click();
      await expect(page.locator(`[data-unit="${ordinary}"]`)).toBeEnabled();
      const source = await page.locator(`[data-unit="${attacker}"]`).boundingBox();
      const target = await page.locator('[data-leader="1"]').getByRole('button', { name: 'お菓子ポイント 4', exact: true }).boundingBox();
      expect(source).not.toBeNull();
      expect(target).not.toBeNull();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await savedGame(page)).winner).toBe(0);
      // ゲームセット and the verdict play first, then the result screen stays.
      const result = page.getByRole('dialog', { name: '対戦結果' });
      await expect(result.getByText('あなたのかち!!', { exact: true })).toBeVisible({ timeout: 10000 });
      await page.reload();
      await expect(result.getByText('あなたのかち!!', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('Jonko concentrates the target, visibly blocks damage, and the bonus draw remains available', async ({ page }) => {
      const s = arena({ me: { hand: ['s_6'] }, foe: { field: ['y_28', 'y_9'] } });
      s.players[0].played.push('s_7');
      const [jonko, ordinary] = field(s, 1);
      await loadBoard(page, s);
      await useSweet(page, hand(s)[0]);
      await expect(page.locator(`[data-unit="${jonko}"]`)).toHaveClass(/targetable/);
      await expect(page.locator(`[data-unit="${ordinary}"]`)).not.toHaveClass(/targetable/);
      await page.locator(`[data-unit="${jonko}"]`).click();
      await expect(page.getByText('じょんこが止めた！', { exact: true })).toBeVisible();
      await expect(page.getByText('ダメージを防いだ', { exact: true })).toBeVisible();
      await expect(page.locator('[data-deck="0-yojo"]')).toBeDisabled();
      await expect(page.getByText('じょんこが止めた！', { exact: true })).toBeHidden();
      await page.locator('[data-deck="0-yojo"]').click();
      await expect.poll(async () => (await savedGame(page)).players[0].hand.length).toBe(1);
      expect((await savedGame(page)).cards[jonko].damage).toBe(0);
      await page.reload();
      await expect(page.getByText('じょんこが止めた！', { exact: true })).toBeHidden();
    });
  });
}

test('CPU responds after turn end and returns control with a manual draw', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const s = arena({ me: { hand: ['y_9'] }, foe: { hand: ['y_0'] } });
  await loadBoard(page, s, 'cpu');
  await page.getByRole('button', { name: /ターン\s*終了/ }).click();
  await expect.poll(async () => (await savedGame(page)).turn, { timeout: 30000 }).toBeGreaterThanOrEqual(5);
  await expect.poll(async () => (await savedGame(page)).active).toBe(0);
  await expect(page.locator('[data-deck="0-yojo"]')).toBeEnabled();
  await page.locator('[data-deck="0-yojo"]').click();
  await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('ending with eleven cards requires two hand exclusions before the turn changes', async ({ page }) => {
  const s = arena({ me: { hand: Array(11).fill('y_5') } });
  s.players[1].yojo = [];
  s.players[1].sweet = [];
  await loadBoard(page, s);
  await page.getByRole('button', { name: /ターン\s*終了/ }).click();
  await expect(page.getByText('あと2枚除外', { exact: true })).toBeVisible();
  const chosen = hand(s).slice(-2).reverse();
  await page.locator(`[data-hand-list] [data-hand="${chosen[0]}"]`).click();
  await expect(page.getByText('あと1枚除外', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('あと1枚除外', { exact: true })).toBeVisible();
  await page.locator(`[data-hand-list] [data-hand="${chosen[1]}"]`).click();
  await expect.poll(async () => (await savedGame(page)).active).toBe(1);
  const next = await savedGame(page);
  expect(next.players[0].hand).toHaveLength(9);
  expect(next.players[0].exile).toEqual(chosen);
  expect(next.players[0].nap).toHaveLength(0);
  expect(next.players[0].pp).toBe(0);
  expect(next.pending).toBeNull();
});

test('second-player fifth-turn PP is shown as seven usable PP and a temporary +2 marble', async ({ page }) => {
  const s = arena({ me: { turns: 4, ppBonus: 0 }, foe: { turns: 4, ppBonus: 0 } });
  await loadBoard(page, s);
  await page.getByRole('button', { name: /ターン\s*終了/ }).click();
  await expect(page.getByLabel('このターンの追加PP 2', { exact: true })).toBeVisible();
  await page.locator('[data-deck="1-yojo"]').click();
  await expect(page.getByRole('group', { name: '自分のPP 7 / 7', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /ターン\s*終了/ }).click();
  await expect(page.getByLabel('このターンの追加PP 2', { exact: true })).toBeHidden();
  expect((await savedGame(page)).players[1].pp).toBe(0);
});

test('a threshold draw is mandatory: the only choice is the sweets deck', async ({ page }) => {
  const s = arena();
  s.players[0].points = 10;
  s.players[0].milestones = [10];
  s.pending = { prompt: 'お菓子ポイント到達：山札を押して1枚引いてください', task: { op: 'draw', actor: 0, deck: 'sweet', text: 'threshold' }, options: [{ id: 'sweet', label: 'お菓子デッキ' }] };
  await loadBoard(page, s);
  await expect(page.getByRole('button', { name: '引かない', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeDisabled();
  await page.locator('[data-deck="0-sweet"]').click();
  await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeEnabled();
  const next = await savedGame(page);
  expect(next.players[0].sweet).toHaveLength(9);
  expect(next.players[0].milestones).toEqual([10]);
});
