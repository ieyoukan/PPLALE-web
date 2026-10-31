import { test, expect } from '@playwright/test';
import { newGame, sandboxRules } from '../packages/game-core/dist/index.js';
import { arena, catalog, run } from '../packages/game-core/tests/helpers.mjs';

test.use({ reducedMotion: 'no-preference' });
const key = 'pplale-game-session-v2';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);
async function load(page, game) {
  await page.goto('/robots.txt');
  await page.evaluate(({ key, game }) => {
    localStorage.setItem('pplale-show-assessment', 'hidden');
    localStorage.setItem(key, JSON.stringify({ game, mode: 'hotseat', level: 'easy' }));
  }, { key, game });
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
}
async function freeze(page) {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
}

test('opening dice finish in one short round and allow the winner to choose', async ({ page }) => {
  const deck = { name: 'テスト', playable: 'p_0', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19') };
  await load(page, newGame([deck, deck], catalog, sandboxRules, 42));
  const die = page.getByRole('button', { name: /のサイコロを振る$/ });
  await expect(die).toBeEnabled();
  await freeze(page);
  for (const actor of [0, 1]) {
    await expect(die).toBeEnabled();
    await die.evaluate(button => button.click());
    await page.clock.runFor(750);
    expect((await saved(page)).dice?.rolls[actor] ?? null).toBeNull();
    await page.clock.runFor(450);
    expect((await saved(page)).dice.rolls[actor]).toBeGreaterThan(0);
  }
  const game = await saved(page);
  expect(game.phase).toBe('initiative');
  expect(game.dice.ties).toBe(0);
  expect(game.dice.rolls[0]).not.toBe(game.dice.rolls[1]);
  await expect(page.getByRole('radio', { name: '先攻', exact: true })).toBeVisible();
});

for (const kind of ['opening', 'effect']) test(`${kind} draws land quickly and ignore taps during the flight`, async ({ page }) => {
  let game = arena();
  if (kind === 'opening') { game.phase = 'opening'; game.openingRemaining = [3, 4]; }
  else game = run(game, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
  await load(page, game);
  const deck = page.locator(`[data-deck="0-${kind === 'opening' ? 'yojo' : 'sweet'}"]`);
  await expect(deck).toBeEnabled();
  await freeze(page);
  // 同じフレームの二重クリックも、飛行中のタップも次のドローとして予約しない。
  await deck.evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(1);
  await expect(deck).toBeDisabled();
  await page.clock.runFor(300);
  await deck.evaluate(button => button.click());
  expect((await saved(page)).players[0].hand).toHaveLength(1);
  await expect(deck).toBeDisabled();
  await page.clock.runFor(200);
  await expect(deck).toBeEnabled();
  await expect(page.locator('[data-draw-flight]')).toHaveCount(0);
  await deck.evaluate(button => button.click());
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(2);
  await page.clock.runFor(600);
  expect((await saved(page)).players[0].hand).toHaveLength(2);
  if (kind === 'opening') {
    await page.getByRole('button', { name: 'メニュー', exact: true }).evaluate(button => button.click());
    await page.getByRole('button', { name: '一手戻す', exact: true }).evaluate(button => button.click());
    await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(1);
    await expect(deck).toBeEnabled();
    await deck.evaluate(button => button.click());
    await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(2);
  }
});
