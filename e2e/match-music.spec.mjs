import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';

// 対戦の曲：設定で選んだ曲が対戦で流れ、曲が始まると右側に曲名が一度出る。初期値はランダム。
const url = process.env.PPLALE_GAME_TEST_URL ?? 'http://localhost:3000/game/';
const choiceKey = 'pplale-match-bgm-v1';

test('the match music chosen in the settings plays in a match, and its title shows once', async ({ page }) => {
  await page.goto(new URL('settings/', url).href);
  // 音量のタブ（ランチパッドの「音量」）。
  await page.getByRole('tab', { name: '音量' }).click();
  const select = page.getByRole('combobox', { name: '対戦の曲' });
  await expect(select).toHaveValue('random');
  await select.selectOption({ label: 'lolipop♪cafe' });
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), choiceKey)).toBe('lolipop-cafe');

  const game = arena({ me: { field: ['y_20'] }, foe: { field: ['y_8'] } });
  game.players[0].name = 'あなた'; game.players[1].name = '相手';
  await page.evaluate(game => localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'hotseat', level: 'easy' })), game);
  await page.goto(new URL('play/', url).href);
  await expect(page.locator('[data-table]')).toBeVisible();
  // Sound starts with the first tap.
  await page.mouse.click(10, 10);
  const title = page.locator('[data-now-playing]');
  await expect(title).toHaveAttribute('data-now-playing', 'lolipop-cafe', { timeout: 15_000 });
  await expect(title).toContainText('lolipop♪cafe');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: test.info().outputPath('match.png') });
});
