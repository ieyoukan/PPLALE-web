import { test, expect } from '@playwright/test';
import { arena, run } from '../packages/game-core/tests/helpers.mjs';
import { viewFor } from '../packages/game-core/dist/index.js';

// お菓子ポイントが10以下になった相手がお菓子を引くまでの間も、自分の幼女を持って攻撃でき、引いたあとに攻撃が届く。
const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');

test('a unit attacks while the opponent still has to draw the sweet their points made them take', async ({ page }) => {
  const id = '123456', errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let game = arena({ me: { field: ['y_6', 'y_9'] }, foe: { points: 11 } }), socket, version = 0;
  const commands = [];
  const view = () => ({ id, version: ++version, status: 'playing', match: 1, matchId: 'queued-attack', seat: 0, spectators: 0,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, last: null, resigned: null,
    players: [{ member: 'me', name: 'あなた', online: true, ready: true }, { member: 'friend', name: 'フレンド', online: true, ready: true }],
    game: viewFor(game, 0),
    plaza: { name: 'ルーム', visibility: 'invite', me: 'me', owner: 'me', creator: { name: 'あなた' },
      members: [{ id: 'me', name: 'あなた', online: true }, { id: 'friend', name: 'フレンド', online: true }], invite: 'test' } });
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => {
    socket = ws;
    ws.onMessage(bytes => {
      const message = JSON.parse(String(bytes));
      if (message.type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view() }));
      if (message.type === 'action') {
        if (message.action.action === 'command') { commands.push(message.action.command); game = run(game, message.action.command); ws.send(JSON.stringify({ type: 'view', view: { ...view(), last: { command: message.action.command } } })); }
        ws.send(JSON.stringify({ type: 'result', n: message.n }));
      }
    });
  });
  await page.goto(`${base}/game/room/${id}/`);
  await expect(page.locator('[data-scene-ready="true"]')).toHaveCount(1, { timeout: 20000 });
  const [first, second] = game.players[0].field;
  // The first attack brings their points to 10 or less: they now have to draw a sweet.
  await page.locator(`[data-unit="${first}"]`).click();
  await page.locator('[data-leader="1"] button').first().click();
  await expect.poll(() => game.pending?.task.text).toBe('threshold');
  // The board shows their points at 10.
  await expect(page.locator('[data-leader="1"] button').first()).toHaveAccessibleName(/10$/);
  // Without waiting for them: the other unit is picked up and attacks; no card details open.
  await page.locator(`[data-unit="${second}"]`).click();
  await expect(page.getByRole('dialog', { name: /拡大|詳細/ })).toHaveCount(0);
  await page.locator('[data-leader="1"] button').first().click();
  await expect(page.getByRole('status').filter({ hasText: '相手が引いたら攻撃します' })).toBeVisible();
  expect(commands.filter(command => command.type === 'attack')).toHaveLength(1);
  // They draw; the waiting attack goes by itself.
  game = run(game, { type: 'choose', actor: 1, option: 'sweet' });
  socket.send(JSON.stringify({ type: 'view', view: view() }));
  await expect.poll(() => commands.filter(command => command.type === 'attack').length, { timeout: 10000 }).toBe(2);
  expect(commands.at(-1)).toMatchObject({ type: 'attack', actor: 0, uid: second, target: 'leader' });
  expect(errors).toEqual([]);
});
