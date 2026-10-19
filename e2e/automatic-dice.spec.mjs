import { test, expect } from '@playwright/test';
import { arena, run } from '../packages/game-core/tests/helpers.mjs';

for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  test.describe(`automatic die ${viewport.width}`, () => {
    test.use({ viewport });
    test('a restored die choice offers six faces and cannot decline the automatic skill', async ({ page }) => {
      const initial = arena();
      initial.players[0].exSkills = { dice: { uses: 1 } };
      initial.queue = [{ op: 'die', actor: 0 }];
      const game = run(initial, { type: 'adjust', actor: 0, resource: 'pp', delta: 0 }, true);
      game.pending.options.unshift({ id: 'roll', label: '使わずに振る' });
      await page.goto('/game/');
      await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
      await page.evaluate(game => {
        localStorage.setItem('pplale-show-assessment', 'hidden');
        localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'cpu', level: 'easy' }));
      }, game);
      await page.goto('/game/play/');
      await expect(page.getByText('クマはサイコロを振らない：出目を指定してください', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /出目を[1-6]にする/ })).toHaveCount(6);
      await expect(page.getByRole('button', { name: /使わずに振る|使用しない|使わない/ })).toHaveCount(0);
      await page.getByRole('button', { name: '出目を6にする（残り1回）', exact: true }).click();
      await expect(page.getByRole('button', { name: /出目を[1-6]にする/ })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pplale-game-session-v2')).game.players[0].exSkills.dice.uses)).toBe(0);
    });
  });
}
