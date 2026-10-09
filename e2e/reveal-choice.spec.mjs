import { test, expect } from '@playwright/test';
import { arena, hand } from '../packages/game-core/tests/helpers.mjs';

const key = 'pplale-game-session-v2';
const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);
const card = (page, uid) => page.locator(`[data-hand-list] [data-hand="${uid}"]`);
const handOrder = page => page.locator('[data-hand-list] [data-hand]').evaluateAll(cards => cards.map(card => card.dataset.hand));
const completion = page => page.getByRole('button', { name: '公開を完了', exact: true });
async function loadBoard(page, game) {
  await page.goto('/game/');
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(({ key, game }) => localStorage.setItem(key, JSON.stringify({ game, mode: 'hotseat', level: 'easy' })), { key, game });
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
  // The development-only Next indicator overlaps the first card on a narrow viewport.
  await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
}
async function gap(page, left, right) {
  const a = await card(page, left).boundingBox(), b = await card(page, right).boundingBox();
  return b.x - a.x - a.width;
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}×${viewport.height} reveal confirmation`, () => {
    test.use({ viewport });
    test('hand cards move to the public area and can return before confirmation without a modal', async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const game = arena({ me: { hand: ['y_31', 'y_60', 'y_60', 'y_9'] } });
      const [source, a, b, publicCard] = hand(game); game.cards[publicCard].revealed = true;
      await loadBoard(page, game);
      await card(page, source).click();
      await page.getByRole('button', { name: '場に出す', exact: true }).click();
      const done = completion(page);
      await expect(done).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(card(page, publicCard)).toBeDisabled();
      const box = await done.boundingBox(), publicBox = await card(page, publicCard).boundingBox();
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
      expect(box.y + box.height).toBeLessThan(publicBox.y);
      expect(publicBox.y - box.y - box.height).toBeLessThan(90);
      expect(box.y).toBeGreaterThanOrEqual(0);
      await card(page, a).click();
      await expect(card(page, a)).toHaveAttribute('aria-pressed', 'true');
      await expect(card(page, a)).toHaveAttribute('data-reveal-pending', 'true');
      await expect(card(page, a).getByText('公開予定', { exact: true })).toBeVisible();
      await expect.poll(() => handOrder(page)).toEqual([b, a, publicCard]);
      await page.mouse.move(0, 0); await done.focus();
      await expect.poll(() => gap(page, b, a)).toBeGreaterThan(12);
      await page.screenshot({ path: `/tmp/pplale-reveal-hand-${viewport.width}.png` });
      await card(page, b).focus(); await page.keyboard.press('Space');
      await expect(card(page, b)).toHaveAttribute('aria-pressed', 'true');
      await expect(done).toBeVisible();
      let saved = await savedGame(page);
      expect(saved.cards[a].revealed).toBe(false); expect(saved.cards[b].revealed).toBe(false);
      expect(saved.cards[source].attackBonus).toBe(0);
      expect(saved.players[0].hand).toEqual([a, b, publicCard]);
      await page.reload();
      await expect(card(page, a)).toHaveAttribute('data-reveal-pending', 'true');
      await expect(card(page, b)).toHaveAttribute('data-reveal-pending', 'true');
      await card(page, a).click();
      await expect(card(page, a)).toHaveAttribute('aria-pressed', 'false');
      await expect(card(page, a)).not.toHaveAttribute('data-reveal-pending', 'true');
      await expect(card(page, a).getByText('公開予定', { exact: true })).toHaveCount(0);
      await page.mouse.move(0, 0); await done.focus();
      await expect.poll(() => gap(page, a, b)).toBeGreaterThan(12);
      await done.click();
      await expect(done).toBeHidden();
      await expect.poll(async () => (await savedGame(page)).cards[b].revealed).toBe(true);
      saved = await savedGame(page);
      expect(saved.cards[a].revealed).toBe(false);
      expect(saved.cards[publicCard].revealed).toBe(true);
      await expect(card(page, b)).toHaveAttribute('data-revealed', 'true');
      await expect(card(page, b)).not.toHaveAttribute('data-reveal-pending', 'true');
      await expect(card(page, a)).not.toHaveAttribute('data-revealed', 'true');
      expect(errors).toEqual([]);
    });
  });
}

test('editor grape sample reveals selected hand cards on completion before resolving its bonus', async ({ page }) => {
  await page.goto('/game/editor/');
  await page.getByRole('button').filter({ hasText: 'ぶどう：公開手札とおにごっこ' }).click();
  await page.getByRole('toolbar', { name: '盤面エディタ' }).waitFor();
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('button', { name: 'この盤面で遊ぶ', exact: true }).click();
  await page.getByRole('button', { name: '両側を自分で操作する' }).click();
  const game = await savedGame(page), p = game.players[0];
  const source = p.hand.find(uid => game.cards[uid].cardId === 'y_31');
  const picks = p.hand.filter(uid => game.cards[uid].cardId === 'y_60');
  await card(page, source).click();
  await page.getByRole('button', { name: '場に出す', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const uid of picks) {
    await card(page, uid).click();
    await expect(card(page, uid)).toHaveAttribute('data-reveal-pending', 'true');
  }
  expect((await savedGame(page)).cards[source].attackBonus).toBe(0);
  await completion(page).click();
  await expect(completion(page)).toBeHidden();
  await expect.poll(async () => (await savedGame(page)).cards[source].attackBonus).toBe(1);
  await expect(page.locator('[data-deck="0-yojo"]')).toBeEnabled();
  await page.locator('[data-deck="0-yojo"]').click();
  await expect.poll(async () => (await savedGame(page)).pending).toBeNull();
});

test('returning the last selected card to the hand and completing reveals nothing', async ({ page }) => {
  const game = arena({ me: { hand: ['y_31', 'y_60'] } }), [source, uid] = hand(game);
  await loadBoard(page, game);
  await card(page, source).click();
  await page.getByRole('button', { name: '場に出す', exact: true }).click();
  const pick = card(page, uid);
  await pick.click(); await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await pick.click(); await expect(pick).toHaveAttribute('aria-pressed', 'false');
  await expect(pick).not.toHaveAttribute('data-reveal-pending', 'true');
  await expect(pick).not.toHaveClass(/revealedHandCard/);
  await completion(page).click();
  await expect(completion(page)).toBeHidden();
  expect((await savedGame(page)).cards[uid].revealed).toBe(false);
});
