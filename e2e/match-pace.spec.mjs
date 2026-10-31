import { test, expect } from '@playwright/test';
import { newGame, sandboxRules } from '../packages/game-core/dist/index.js';
import { arena, catalog, run } from '../packages/game-core/tests/helpers.mjs';

test.use({ reducedMotion: 'no-preference' });
const key = 'pplale-game-session-v2';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);
async function load(page, game, mode = 'hotseat') {
  await page.goto('/robots.txt');
  await page.evaluate(({ key, game, mode }) => {
    localStorage.setItem('pplale-show-assessment', 'hidden');
    localStorage.setItem(key, JSON.stringify({ game, mode, level: 'easy' }));
  }, { key, game, mode });
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

for (const kind of ['opening', 'effect']) test(`${kind} draws overlap at the original speed and ignore double taps`, async ({ page }) => {
  let game = arena();
  if (kind === 'opening') { game.phase = 'opening'; game.openingRemaining = [3, 4]; }
  else game = run(game, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
  await load(page, game);
  const deck = page.locator(`[data-deck="0-${kind === 'opening' ? 'yojo' : 'sweet'}"]`);
  await expect(deck).toBeEnabled();
  await freeze(page);
  // 同じフレームの二重クリックと短い連打は、次のドローとして予約しない。
  await deck.evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(1);
  await expect(deck).toBeDisabled();
  await page.clock.runFor(200);
  await deck.evaluate(button => button.click());
  expect((await saved(page)).players[0].hand).toHaveLength(1);
  await expect(deck).toBeDisabled();
  await page.clock.runFor(150);
  await expect(deck).toBeEnabled();
  const flights = page.locator('[data-draw-flight]');
  await expect(flights).toHaveCount(1);
  await expect(flights.first()).toHaveCSS('animation-duration', '0.8s');
  await flights.first().evaluate(element => { element.drawAnimation = element.getAnimations()[0]; });
  await deck.evaluate(button => button.click());
  await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(2);
  await expect(flights).toHaveCount(2);
  // 2枚目を引いても、1枚目の移動アニメーションは最初から再生しない。
  expect(await flights.first().evaluate(element => element.getAnimations()[0] === element.drawAnimation)).toBe(true);
  if (kind === 'effect') await expect(page.getByRole('button', { name: /ターン\s*終了/ })).toBeDisabled();
  await page.clock.runFor(1100);
  await expect(flights).toHaveCount(0);
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


test('CPU opening draws overlap without speeding up the cards', async ({ page }, info) => {
  const game = arena();
  game.phase = 'opening'; game.openingRemaining = [3, 3];
  await load(page, game, 'cpu');
  await expect(page.locator('[data-draw-flight]')).toHaveCount(2);
  expect((await saved(page)).players[1].hand.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-draw-flight]').first()).toHaveCSS('animation-duration', '0.8s');
  await page.screenshot({ path: info.outputPath('overlapping-draws.png') });
});
