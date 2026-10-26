import { test, expect } from '@playwright/test';
import { arena, run } from '../packages/game-core/tests/helpers.mjs';

async function load(page, game, mode = 'cpu') {
  // Any page of the site keeps the saved match: a plain file, so no room is made on the way.
  await page.goto('/robots.txt');
  await page.evaluate(({ game, mode }) => {
    localStorage.setItem('pplale-show-assessment', 'hidden');
    localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode, level: 'easy' }));
  }, { game, mode });
  await page.goto('/game/play/');
  await expect(page.locator('[data-table]')).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test.describe(`threshold guide ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('points to the sweet deck on the opponent’s turn until both threshold draws are completed', async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let game = arena({ me: { points: 12 } });
      game.active = 1;
      game = run(game, { type: 'adjust', actor: 0, resource: 'points', delta: -8 }, true);
      expect(game.pending.task.text).toBe('threshold');
      await load(page, game);
      const deck = page.locator('button[data-deck="0-sweet"]');
      const cue = deck.locator('[data-draw-cue]');
      await expect(cue).toBeVisible();
      await expect(deck).toHaveAccessibleDescription('お菓子を1枚引く');
      await expect(page.locator('[data-draw-cue]')).toHaveCount(1);
      const bounds = await cue.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      const arrow = await cue.locator('svg').boundingBox();
      expect(Math.min(arrow.width, arrow.height)).toBeGreaterThan(38);
      await page.screenshot({ path: info.outputPath('threshold-draw-guide.png') });
      // The cue itself is part of the deck button, so tapping the arrow works too.
      await cue.locator('svg').click();
      await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(1);
      await expect(cue).toBeVisible({ timeout: 10000 });
      await deck.click();
      await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(2);
      await expect(page.locator('[data-draw-cue]')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}

test('ordinary draws keep their usual cue; a threshold cue respects reduced motion', async ({ page }) => {
  let game = arena();
  game.pending = { task: { op: 'draw', actor: 0, text: 'turn' }, prompt: 'ターン開始', options: [{ id: 'yojo', label: '幼女' }, { id: 'sweet', label: 'お菓子' }] };
  await load(page, game);
  await expect(page.locator('[data-draw-cue]')).toHaveCount(0);
  await expect(page.locator('button[data-deck="0-sweet"]')).toBeEnabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  game = run(arena(), { type: 'adjust', actor: 0, resource: 'points', delta: -3 }, true);
  await load(page, game);
  const cue = page.locator('[data-draw-cue]');
  await expect(cue).toBeVisible();
  expect(await cue.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});

test('a room guest sees the guide on their own sweet deck, and spectators see none', async ({ browser }) => {
  test.skip(!process.env.PPLALE_ROOM_TEST_URL, 'set PPLALE_ROOM_TEST_URL for the room socket harness');
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const game = run(arena(), { type: 'adjust', actor: 1, resource: 'points', delta: -3 }, true);
    const view = { id: '123456', version: 1, seat: 1, spectators: 0, status: 'playing', match: 1,
      rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true },
      players: [{ name: 'ホスト', online: true, ready: true }, { name: 'ゲスト', online: true, ready: true }],
      game, last: null, resigned: null };
    await page.addInitScript(() => localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ '123456': { seat: 1, token: 'test', at: Date.now() } })));
    await page.routeWebSocket(/\/rooms\/123456\/socket/, route => route.onMessage(data => {
      if (JSON.parse(String(data)).type === 'hello') route.send(JSON.stringify({ type: 'view', view }));
    }));
    await page.goto('/game/room/?id=123456');
    await expect(page.locator('button[data-deck="1-sweet"] [data-draw-cue]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('button[data-deck="0-sweet"] [data-draw-cue]')).toHaveCount(0);
    view.watching = true;
    view.seat = 0;
    await page.goto('/game/room/?id=123456&watch=1');
    await expect(page.locator('[data-table]')).toBeVisible();
    await expect(page.locator('[data-draw-cue]')).toHaveCount(0);
  } finally { await context.close(); }
});
