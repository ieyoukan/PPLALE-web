import { test, expect } from '@playwright/test';
import { arena, field, hand } from '../packages/game-core/tests/helpers.mjs';

const key = 'pplale-game-session-v2';
const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);
const used = page => page.getByText('うぃまるを使った！', { exact: true });

async function loadBoard(page, game) {
  game.players[0].name = 'あなた'; game.players[1].name = 'CPU';
  await page.goto('/game/');
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(({ key, game }) => localStorage.setItem(key, JSON.stringify({ game, mode: 'cpu', level: 'normal' })), { key, game });
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}px Wimaru hand reaction`, () => {
    test.use({ viewport });
    test('CPU waits for the human reaction; activating announces Wimaru and protects even a lethal attack with no PP', async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const game = arena({ me: { hand: ['y_64'], points: 2, pp: 0 }, foe: { field: ['y_25'] } });
      game.active = 1; game.players[1].skills.fill(0);
      const uid = hand(game)[0], deckSize = game.players[0].yojo.length + game.players[0].sweet.length;
      await loadBoard(page, game);
      const decline = page.getByRole('button', { name: '発動しない', exact: true });
      await expect(decline).toBeEnabled({ timeout: 15000 });
      const before = await savedGame(page);
      expect(before.active).toBe(1); expect(before.pending.task.op).toBe('eatResponse'); expect(before.pending.task.actor).toBe(0);
      expect(before.players[0].points).toBe(2); expect(before.winner).toBeNull();
      // Longer than the CPU's delay: a human-owned response must not be answered automatically.
      await page.waitForTimeout(1000);
      expect((await savedGame(page)).revision).toBe(before.revision);
      await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
      await expect(used(page)).toBeVisible();
      const announcement = page.getByRole('status').filter({ hasText: 'うぃまるを使った！' });
      await expect(announcement.getByText('あなたの手札の効果', { exact: true })).toBeVisible();
      await expect(announcement.getByRole('img', { name: 'うぃまる', exact: true })).toBeVisible();
      await expect(announcement.getByText(/お菓子ポイントの変動を無効化/)).toBeVisible();
      await expect.poll(() => used(page).evaluate(text => Number(getComputedStyle(text.parentElement).opacity)), { intervals: [50] }).toBeGreaterThan(0.95);
      await expect(decline).toBeHidden();
      await page.screenshot({ path: `/tmp/pplale-wimaru-reaction-${viewport.width}.png` });
      await expect.poll(async () => (await savedGame(page)).players[0].nap.includes(uid)).toBe(true);
      expect((await savedGame(page)).players[0].pp).toBe(0);
      const deck = page.getByRole('button', { name: '幼女デッキ', exact: true });
      for (let i = 0; i < 4; i++) {
        await expect(deck).toBeEnabled(); await deck.click();
        await expect.poll(async () => (await savedGame(page)).players[0].exile.length).toBe(i + 1);
      }
      const after = await savedGame(page);
      expect(after.players[0].points).toBe(2); expect(after.winner).toBeNull();
      expect(after.players[0].hand).not.toContain(uid); expect(after.cards[uid].revealed).toBe(true);
      expect(after.players[0].yojo.length + after.players[0].sweet.length).toBe(deckSize - 4);
      await page.reload(); await expect(used(page)).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}

test('the CPU hand reaction visibly activates and protects its sweets', async ({ page }) => {
  const game = arena({ me: { field: ['y_9'] }, foe: { hand: ['y_64'], points: 1, pp: 0 } });
  const uid = hand(game, 1)[0], attacker = field(game)[0];
  await loadBoard(page, game);
  await page.locator(`[data-unit="${attacker}"]`).click();
  await page.locator('[data-leader="1"]').getByRole('button', { name: 'お菓子ポイント 1', exact: true }).click();
  await expect(used(page)).toBeVisible({ timeout: 15000 });
  const announcement = page.getByRole('status').filter({ hasText: 'うぃまるを使った！' });
  await expect(announcement.getByText('CPUの手札の効果', { exact: true })).toBeVisible();
  await expect(announcement.getByRole('img', { name: 'うぃまる', exact: true })).toBeVisible();
  await expect.poll(() => used(page).evaluate(text => Number(getComputedStyle(text.parentElement).opacity)), { intervals: [50] }).toBeGreaterThan(0.95);
  await expect.poll(async () => (await savedGame(page)).players[1].nap.includes(uid)).toBe(true);
  await expect.poll(async () => (await savedGame(page)).players[1].exile.length, { timeout: 10000 }).toBe(1);
  const after = await savedGame(page);
  expect(after.players[1].points).toBe(1); expect(after.winner).toBeNull(); expect(after.cards[uid].revealed).toBe(true);
});

test('declining the hand reaction applies the attack without claiming Wimaru was used', async ({ page }) => {
  const game = arena({ me: { hand: ['y_64'], points: 1 }, foe: { field: ['y_9'] } });
  game.active = 1; game.players[1].skills.fill(0);
  const uid = hand(game)[0];
  await loadBoard(page, game);
  await page.getByRole('button', { name: '発動しない', exact: true }).click();
  await expect.poll(async () => (await savedGame(page)).winner).toBe(1);
  const after = await savedGame(page);
  expect(after.players[0].points).toBe(0); expect(after.players[0].hand).toContain(uid);
  expect(after.players[0].nap).not.toContain(uid); expect(after.cards[uid].revealed).toBe(false);
  await expect(used(page)).toBeHidden();
});
