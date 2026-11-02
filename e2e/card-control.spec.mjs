import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';

// 設定の「矢印でねらう」：カードは置いたまま、曲線の矢印で場所・攻撃先をねらって離すと出せる・攻撃できる。
const url = process.env.PPLALE_GAME_TEST_URL ?? 'http://localhost:3000/game/';

async function hold(page, from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + Math.min(40, a.height / 2)); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 6, a.y + 12, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
}

test('aiming with the arrow plays a card onto a slot and attacks a unit, the card staying in place', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const game = arena({ me: { hand: ['y_9'], field: ['y_0'] }, foe: { field: ['y_1'] } });
  game.players[0].name = 'あなた'; game.players[1].name = '相手';
  await page.goto(new URL('/robots.txt', url).href);
  await page.evaluate(game => { localStorage.setItem('pplale-card-control-v1', 'aim'); localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'hotseat', level: 'easy' })); }, game);
  await page.goto(new URL('play/', url).href);
  await expect(page.locator('[data-table]')).toBeVisible();

  const unit = page.locator('button[data-side="0"][data-unit]').first(), enemy = page.locator('button[data-side="1"][data-unit]').first();
  await hold(page, unit, enemy);
  await expect(page.locator('[data-aim-arrow][data-ready]')).toHaveCount(1);
  await expect(page.locator('[data-held-card]')).toHaveCount(0);
  await expect(unit).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-aim-arrow]')).toHaveCount(0);
  await expect(page.locator('[data-aimed]')).toHaveCount(0);
  await expect(page.locator('button[data-side="1"][data-unit]')).toHaveCount(0);

  const card = page.locator('[data-hand-list] [data-hand]').first(), slot = page.locator('button[data-side="0"][data-slot="4"]');
  await hold(page, card, slot);
  await expect(page.locator('[data-aim-arrow][data-ready]')).toHaveCount(1);
  await expect(slot).toHaveAttribute('data-aimed', '');
  await page.mouse.up();
  await expect(slot).toHaveAttribute('data-unit', /.+/);
  expect(errors).toEqual([]);
});
