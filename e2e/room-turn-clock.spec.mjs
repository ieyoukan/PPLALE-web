import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }]) {
  test.describe(`room turn clock ${viewport.width}`, () => {
    test.use({ viewport });
    test('counts against server time, pauses during a choice and resumes without ticking network traffic', async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const game = arena();
      const id = '123456', serverNow = Date.now() + 60_000;
      let view = {
        id, version: 1, seat: 0, spectators: 0, status: 'playing', match: 1,
        rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: false, turnSeconds: 120 },
        players: [{ name: 'あなた', online: true, ready: true }, { name: '相手', online: true, ready: true }],
        game, last: null, resigned: null, serverNow,
        turnClock: { turn: game.turn, side: game.active, remainingMs: 65_000, deadline: serverNow + 65_000 },
      };
      let socket, messages = 0;
      await page.addInitScript(({ id }) => {
        localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ [id]: { seat: 0, token: 'test', at: Date.now() } }));
      }, { id });
      await page.routeWebSocket(/\/rooms\/123456\/socket/, route => {
        socket = route;
        route.onMessage(data => {
          messages++;
          if (JSON.parse(String(data)).type === 'hello') route.send(JSON.stringify({ type: 'view', view }));
        });
      });
      await page.goto(`${base}/game/room/?id=${id}`);
      const clock = page.getByRole('timer', { name: 'ターン残り時間' });
      await expect(clock).toBeVisible({ timeout: 20000 });
      await expect(clock.locator('time')).toHaveText(/1:0[3-5]/);
      await expect(clock).not.toHaveAttribute('data-paused');
      await expect.poll(() => clock.locator('time').textContent(), { timeout: 5000 }).not.toBe('1:05');
      const pending = { task: { op: 'skillReaction', actor: 1 }, prompt: 'スキルを使いますか？', options: [{ id: 'skip', label: '使わない' }] };
      view = { ...view, version: 2, game: { ...game, revision: game.revision + 1, pending }, serverNow: serverNow + 5000,
        turnClock: { ...view.turnClock, remainingMs: 62_000, deadline: null } };
      socket.send(JSON.stringify({ type: 'view', view }));
      await expect(clock).toHaveAttribute('data-paused', 'true');
      await expect(clock.locator('time')).toHaveText('1:02');
      await page.waitForTimeout(1500);
      await expect(clock.locator('time')).toHaveText('1:02');
      const bounds = await clock.boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: info.outputPath('turn-clock-paused.png') });
      view = { ...view, version: 3, game: { ...game, revision: game.revision + 2 }, serverNow: serverNow + 10_000,
        turnClock: { ...view.turnClock, deadline: serverNow + 72_000 } };
      socket.send(JSON.stringify({ type: 'view', view }));
      await expect(clock).not.toHaveAttribute('data-paused');
      await expect.poll(() => clock.locator('time').textContent(), { timeout: 5000 }).toBe('1:01');
      expect(messages).toBe(1); // hello only; the countdown sends no commands or clock polls.
      view = { ...view, version: 4, rules: { ...view.rules, turnSeconds: undefined }, turnClock: undefined };
      socket.send(JSON.stringify({ type: 'view', view }));
      await expect(clock).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
