import { test, expect } from '@playwright/test';
import { newGame, sandboxRules, viewFor } from '../packages/game-core/dist/index.js';
import { catalog, run } from '../packages/game-core/tests/helpers.mjs';
import deck from '../src/data/strawberryStableDeck.json' with { type: 'json' };

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server URL');
test.use({ reducedMotion: 'reduce' });

function preparation() {
  let game = newGame([deck, deck], catalog, sandboxRules, 7);
  for (let i = 0; i < 10 && game.phase === 'dice'; i++) {
    game = run(game, { type: 'roll', actor: 0 });
    if (game.phase === 'dice') game = run(game, { type: 'roll', actor: 1 });
  }
  game = run(game, { type: 'initiative', actor: game.active, order: 'first' });
  game = run(game, { type: 'openingDraw', actor: 0, deck: 'yojo' });
  game = run(game, { type: 'openingDraw', actor: 1, deck: 'yojo' });
  const opening = structuredClone(game);
  for (const actor of [0, 1]) while (game.openingRemaining[actor] > 0) game = run(game, { type: 'openingDraw', actor, deck: 'yojo' });
  const mulligan = structuredClone(game);
  for (const actor of [0, 1]) game = run(game, { type: 'keep', actor });
  return { opening, mulligan, playing: game };
}
const states = preparation();

async function spectator(page, game) {
  const id = '123459';
  let socket, version = 0;
  const actions = [];
  const view = state => ({ id, version: ++version, seat: 0, watching: true, status: state ? 'playing' : 'lobby', match: 1,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, spectators: 1, last: null, resigned: null,
    players: [{ name: '対戦している人', member: 'player', ready: !!state, online: true }, { name: 'CPU・ふつう', cpu: 'normal', ready: true, online: true }],
    game: state ? viewFor(state, 'spectator') : null,
    plaza: { name: 'CPUとあそぶルーム', visibility: 'public', creator: { name: '対戦している人' }, owner: 'player', me: 'watcher',
      members: [{ id: 'player', name: '対戦している人', online: true, seat: 0 }, { id: 'watcher', name: '観戦する人', online: true }] },
  });
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test-watcher', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123459\/socket/, ws => {
    socket = ws;
    ws.onMessage(bytes => { const message = JSON.parse(String(bytes)); actions.push(message); if (message.type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view(game) })); });
  });
  await page.goto(`${base}/game/room/${id}/`);
  return { actions, update: state => socket.send(JSON.stringify({ type: 'view', view: view(state) })) };
}

for (const phase of ['opening', 'mulligan', 'playing']) {
  test(`a CPU room can be watched during ${phase} with both hands visible`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const { actions } = await spectator(page, states[phase]);
    await expect(page.locator('[data-table]')).toBeVisible();
    await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(states[phase].players[0].hand.length);
    for (const card of await page.locator('[data-hand-list] [data-hand]').all()) {
      await expect(card).toBeEnabled();
      await expect(card.getByRole('img')).toBeVisible();
    }
    await expect(page.locator('[aria-label^="相手の手札"] [data-hand] img')).toHaveCount(states[phase].players[1].hand.length);
    await expect(page.getByRole('button', { name: '相手の非公開手札', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '自分のデッキ', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '観戦中', exact: true })).toBeDisabled();
    if (phase === 'playing') await page.screenshot({ path: test.info().outputPath('room-spectating.png') });
    await expect(page.getByText('This page couldn’t load', { exact: true })).toHaveCount(0);
    expect(actions.filter(message => message.type === 'action')).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('a spectator stays in a preparing CPU room as it starts, and can inspect either hand', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { update, actions } = await spectator(page, null);
  await expect(page.getByText('CPU・ふつう', { exact: true })).toBeVisible();
  await expect(page.getByText('席があくのを待っています', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'じゅんびOK!', exact: true })).toHaveCount(0);
  for (const phase of ['opening', 'mulligan', 'playing']) {
    update(states[phase]);
    await expect(page.locator('[data-table]')).toBeVisible();
    await expect(page.locator('[data-hand-list] [data-hand]')).toHaveCount(states[phase].players[0].hand.length);
  }
  const revealed = states.playing;
  const uid = revealed.players[0].hand[0], other = revealed.players[1].hand[0];
  const near = page.locator(`[data-hand-list] [data-hand="${uid}"]`);
  await expect(near.getByRole('img')).toHaveAttribute('alt', catalog[revealed.cards[uid].cardId].name);
  await expect(page.getByRole('button', { name: `相手の手札 ${catalog[revealed.cards[other].cardId].name}`, exact: true })).toBeEnabled();
  await near.click();
  await expect(page.getByRole('complementary', { name: 'カード情報' }).getByRole('img', { name: catalog[revealed.cards[uid].cardId].name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '場に出す', exact: true })).toHaveCount(0);
  expect(actions.filter(message => message.type === 'action')).toEqual([]);
  expect(errors).toEqual([]);
});
