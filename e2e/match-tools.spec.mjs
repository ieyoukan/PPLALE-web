import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';
import { readFileSync } from 'node:fs';

const deck = JSON.parse(readFileSync(new URL('../src/data/strawberryStableDeck.json', import.meta.url), 'utf8'));
for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }]) {
  test.describe(`match tools ${viewport.width}`, () => {
    test.use({ viewport });
    test('deck copies, played status, counters and searchable turn logs are accessible', async ({ page }, info) => {
      const game = arena();
      game.players[0].played = ['y_2', 'yt_0', 's_1', 's_1'];
      game.players[0].mochidaLeft = 10;
      game.log = [`${game.players[0].name}の1ターン目`, '猫まんじゅうをプレイ', 'お菓子ポイント 15 → 13'];
      await page.goto('/game/cpu/');
      await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
      await page.evaluate(({ game, deck }) => {
        localStorage.setItem('pplale-show-assessment', 'hidden');
        localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'hotseat', levels: ['easy', 'easy'], setup: { decks: [deck, deck], rules: game.rules } }));
      }, { game, deck });
      await page.goto('/game/play/');
      await expect(page.locator('[data-table]')).toBeVisible();
      await page.getByRole('button', { name: '自分のデッキ', exact: true }).click();
      await expect(page.getByRole('heading', { name: '自分のデッキ', exact: true })).toBeVisible();
      await expect(page.getByText('対戦開始時の採用カード', { exact: false })).toBeVisible();
      await expect(page.getByText('未プレイ', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'カードのカウント', exact: true }).click();
      await expect(page.getByText('場を離れた数', { exact: true }).first()).toBeVisible();
      await page.getByText('プレイ済みカード · 4枚', { exact: true }).click();
      await expect(page.getByRole('button', { name: /少女うゆち/ }).first()).toBeVisible();
      await page.screenshot({ path: info.outputPath('counts.png') });
      await page.getByRole('button', { name: '対戦ログ', exact: true }).click();
      await expect(page.getByRole('log')).toContainText('猫まんじゅうをプレイ');
      await page.getByRole('searchbox', { name: '対戦ログを検索' }).fill('猫まんじゅう');
      await expect(page.getByRole('log')).not.toContainText('15 → 13');
      await expect(page.getByRole('log')).toContainText('猫まんじゅう');
    });
  });
}

test('spectators can open logs and search without controlling the match', async ({ page }) => {
  const game = arena({ foe: { pp: 0 } });
  game.active = 1;
  game.log = ['観戦テスト：猫まんじゅうをプレイ'];
  await page.goto('/game/cpu/');
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(game => {
    localStorage.setItem('pplale-show-assessment', 'hidden');
    localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'watch', level: 'easy' }));
  }, game);
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
  await page.getByRole('button', { name: '対戦ログ', exact: true }).click();
  await page.getByRole('searchbox', { name: '対戦ログを検索' }).fill('観戦テスト');
  await expect(page.getByRole('log')).toContainText('猫まんじゅうをプレイ');
});
