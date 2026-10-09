import { test, expect } from '@playwright/test';
import { arena, field, hand } from '../packages/game-core/tests/helpers.mjs';

const key = 'pplale-game-session-v2';
const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);

async function loadBoard(page, game) {
  await page.goto('/game/');
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(({ game, key }) => localStorage.setItem(key, JSON.stringify({ game, mode: 'hotseat', level: 'easy' })), { game, key });
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
}

async function gap(page, left, right) {
  const a = await page.locator(`[data-hand="${left}"]`).boundingBox();
  const b = await page.locator(`[data-hand="${right}"]`).boundingBox();
  return a && b ? b.x - a.x - a.width : -1;
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}px revealed hand`, () => {
    test.use({ viewport });
    test('revealed cards sit apart on both sides and still play from hand', async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const game = arena({ me: { hand: ['y_9', 'y_148', 'y_60', 's_44'], field: ['y_9'], pp: 12 }, foe: { hand: ['y_149', 'y_9', 'y_37'] } });
      const [ordinary, reveal, lastOrdinary, alreadyPublic] = hand(game), [opponentPublic, , lastOpponent] = hand(game, 1);
      game.cards[alreadyPublic].revealed = true; game.cards[opponentPublic].revealed = true;
      await loadBoard(page, game);
      await page.locator(`[data-hand-list] [data-hand="${reveal}"]`).click();
      await page.getByRole('button', { name: '公開する', exact: true }).click();
      await expect(page.locator('[data-hand-list] [data-revealed="true"]')).toHaveCount(2);
      await page.mouse.move(0, viewport.height / 2);
      await expect.poll(() => gap(page, lastOrdinary, reveal)).toBeGreaterThan(12);
      await expect.poll(() => gap(page, lastOpponent, opponentPublic)).toBeGreaterThan(8);
      await expect(page.locator(`[data-hand="${reveal}"]`).getByText('公開', { exact: true })).toBeVisible();
      await expect(page.locator(`[data-hand="${opponentPublic}"]`).getByText('公開', { exact: true })).toBeVisible();
      expect((await savedGame(page)).players[0].hand).toEqual([ordinary, reveal, lastOrdinary, alreadyPublic]);
      await page.screenshot({ path: test.info().outputPath('revealed-hand.png') });
      await page.locator(`[data-hand="${reveal}"]`).click();
      await page.getByRole('button', { name: '場に出す', exact: true }).click();
      await expect.poll(async () => (await savedGame(page)).players[0].field.includes(reveal)).toBe(true);
      expect((await savedGame(page)).players[0].field).toContain(field(game)[0]);
      expect(errors).toEqual([]);
    });
  });
}

test('a revealed opponent card can be inspected while its other cards stay private', async ({ page }) => {
  const game = arena({ foe: { hand: ['y_149', 'y_9'] } }), [revealed, concealed] = hand(game, 1);
  game.cards[revealed].revealed = true;
  await loadBoard(page, game);
  await expect(page.locator(`[data-hand="${concealed}"]`)).toBeDisabled();
  await expect(page.locator(`[data-hand="${concealed}"] img`)).toHaveCount(0);
  await page.locator(`[data-hand="${revealed}"]`).click();
  await expect(page.getByRole('complementary', { name: 'カード情報' }).getByRole('img', { name: 'Kuu', exact: true })).toBeVisible();
});
