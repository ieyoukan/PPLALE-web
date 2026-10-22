import { test, expect } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';
import { viewFor } from '../packages/game-core/dist/index.js';

for (const { seat, watching } of [{ seat: 0 }, { seat: 1 }, { seat: 0, watching: true }]) test(`${watching ? 'spectator' : 'player'} ${seat} sees public odds, a result curve and the same curve after reload`, async ({ page }, info) => {
  let socket, current = arena(), win = .5, version = 0;
  const view = () => ({
    id: '123456', match: 1, matchId: `assessment-${seat}`, version: ++version, seat, spectators: 0, ...(watching && { watching: true }),
    status: current.winner === null ? 'playing' : 'finished',
    rules: { fruits: ['strawberry', 'grape', 'melon'], extendedPlayable: true },
    players: [{ name: 'いちごさん', ready: true, online: true }, { name: 'おやつさん', ready: true, online: true }],
    game: viewFor(current, seat), last: null, resigned: null,
    assessment: { win, method: 'public-position-value-v1' },
  });
  await page.addInitScript(seat => {
    localStorage.setItem('pplale-room-seats-v2', JSON.stringify({ '123456': { seat, token: 'test-token', at: Date.now() } }));
    localStorage.setItem('pplale-show-assessment', 'shown');
  }, seat);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => {
    socket = ws;
    ws.onMessage(raw => {
      if (JSON.parse(raw).type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view() }));
    });
  });
  await page.goto(`/game/room/?id=123456${watching ? '&watch=1' : ''}`);
  const name = seat === 0 ? 'いちごさん' : 'おやつさん';
  await expect(page.getByRole('status', { name: `形勢 ${name} 50%`, exact: true })).toBeVisible({ timeout: 15000 });
  current = structuredClone(current); current.revision++; current.players[1].points--;
  win = .7;
  socket.send(JSON.stringify({ type: 'view', view: view() }));
  await expect(page.getByRole('status', { name: `形勢 ${name} ${seat === 0 ? 70 : 30}%`, exact: true })).toBeVisible();
  current = structuredClone(current); current.revision++; current.players[1].points = 0; current.winner = 0;
  win = 1;
  socket.send(JSON.stringify({ type: 'view', view: view() }));
  const result = page.getByRole('dialog', { name: '対戦結果', exact: true });
  await expect(result).toBeVisible({ timeout: 15000 });
  const graph = result.getByRole('region', { name: `${name}の形勢の推移`, exact: true });
  await expect(graph).toContainText('公開盤面の目安');
  await expect(graph.getByRole('img')).toHaveAttribute('aria-label', `最後は${seat === 0 ? 100 : 0}%`);
  const curve = await graph.locator('polyline').getAttribute('points');
  expect(curve.split(' ')).toHaveLength(3);
  const actions = result.getByRole('group', { name: '対戦後の操作' });
  for (const button of await actions.getByRole('button').all()) {
    await expect(button).toBeInViewport({ ratio: .999 });
    expect(await button.evaluate(element => element.offsetHeight)).toBeLessThanOrEqual(56);
  }
  await page.screenshot({ path: info.outputPath('player-result.png'), animations: 'disabled' });
  await page.reload();
  await expect(result).toBeVisible();
  await expect(graph.locator('polyline')).toHaveAttribute('points', curve);
});
