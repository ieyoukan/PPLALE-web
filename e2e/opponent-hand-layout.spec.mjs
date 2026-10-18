import { test, expect } from '@playwright/test';
import { arena, hand } from '../packages/game-core/tests/helpers.mjs';

async function load(page, game, mode = 'watch', editing = false) {
  await page.goto('/game/');
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(({ game, mode, editing }) => {
    localStorage.setItem('pplale-show-assessment', 'hidden');
    localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode, level: 'easy', editing }));
  }, { game, mode, editing });
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
  if (mode === 'watch') {
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    await page.getByRole('button', { name: 'CPU一時停止', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /CPU [12]のターン/ })).toHaveCount(0);
  }
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }, { width: 375, height: 812 }]) {
  test.describe(`${viewport.width}px visible opposing hand`, () => {
    test.use({ viewport });
    test('spectating shows changed costs above the counters, and cards remain inspectable', async ({ page }, info) => {
      const game = arena({ me: { hand: ['y_24', 'y_9', 'y_12', 'y_23', 'y_37', 'y_150', 's_19', 'y_27', 'y_3'] }, foe: { pp: 0 } });
      game.active = 1; // This CPU can only end its turn; pause before the far CPU plays a card.
      const changed = hand(game)[0];
      game.cards[changed].costDelta = -2;
      await load(page, game);
      const row = page.getByRole('group', { name: '相手の手札 9枚', exact: true });
      const marker = row.locator(`[data-hand="${changed}"]`).getByRole('img', { name: 'コスト 5から3に減少', exact: true });
      await expect(marker).toBeVisible();
      const tray = await row.boundingBox();
      const far = row.locator('..');
      for (const label of [/^ターン数\(\+pp\) /, /^お菓子ポイント /]) {
        const counter = await far.getByRole('button', { name: label }).locator('..').locator('..').boundingBox();
        expect(tray.y + tray.height).toBeLessThanOrEqual(counter.y);
      }
      const badge = await marker.boundingBox();
      expect(badge.y).toBeGreaterThanOrEqual(0);
      expect(badge.y + badge.height).toBeLessThanOrEqual(tray.y + tray.height);
      if (viewport.width < 1000) {
        const last = row.locator('[data-hand]').last();
        await last.scrollIntoViewIfNeeded();
        const lastBounds = await last.boundingBox();
        expect(lastBounds.x + lastBounds.width).toBeLessThanOrEqual(tray.x + tray.width + 1);
        await row.locator(`[data-hand="${changed}"]`).scrollIntoViewIfNeeded();
      }
      await page.screenshot({ path: info.outputPath('opponent-hand.png') });
      await row.locator(`[data-hand="${changed}"]`).click();
      await expect(page.getByRole('complementary', { name: 'カード情報' }).getByRole('img', { name: 'コスト 5から3に減少', exact: true })).toBeVisible();
    });
  });
}

test('revealed opposing cards show current costs while unrevealed cards stay private', async ({ page }) => {
  const game = arena({ foe: { hand: ['y_9', 'y_24'] } });
  const [privateCard, revealed] = hand(game, 1);
  game.cards[privateCard].costDelta = -1;
  game.cards[revealed].revealed = true;
  game.cards[revealed].costDelta = -2;
  await load(page, game, 'hotseat');
  await expect(page.locator(`[data-hand="${privateCard}"]`)).toBeDisabled();
  await expect(page.locator(`[data-hand="${privateCard}"] img`)).toHaveCount(0);
  await expect(page.locator(`[data-hand="${privateCard}"] [role=img]`)).toHaveCount(0);
  await expect(page.locator(`[data-hand="${revealed}"]`).getByRole('img', { name: 'コスト 5から3に減少', exact: true })).toBeVisible();
});

test('the editor can still add a card to an empty opposing hand', async ({ page }) => {
  await load(page, arena(), 'hotseat', true);
  const row = page.getByRole('group', { name: '相手の手札 0枚', exact: true });
  await row.getByRole('button', { name: '相手の手札に加える', exact: true }).click();
  await expect(page.getByRole('heading', { name: '相手の手札に置くカード', exact: true })).toBeVisible();
});
