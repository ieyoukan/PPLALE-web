import { test, expect } from '@playwright/test';
import { newGame, sandboxRules, viewFor } from '../packages/game-core/dist/index.js';
import { catalog, run } from '../packages/game-core/tests/helpers.mjs';
import deck from '../src/data/strawberryStableDeck.json' with { type: 'json' };

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server');
test.use({ reducedMotion: 'reduce' });
const chatButton = page => page.getByRole('button', { name: 'ルームチャット', exact: true });
const input = page => page.getByRole('textbox', { name: 'メッセージ', exact: true });
const log = page => page.getByRole('log', { name: 'チャットのメッセージ' });

test('two browsers chat before and during a match, from the menu, and after reconnecting', async ({ page, browser }, info) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/game/`);
  await page.waitForURL(/\/game\/room\/\d{6}\/$/);
  const roomURL = page.url();
  let lastSentAt = 0;
  const say = async text => {
    // Respect the server's one-message-per-second limit even on a warm production build.
    const remaining = 1050 - (Date.now() - lastSentAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
    await input(page).fill(text); await input(page).press('Enter');
    await expect(input(page)).toHaveValue(''); lastSentAt = Date.now();
  };
  const invite = await page.evaluate(() => { const saved = JSON.parse(localStorage.getItem('pplale-plaza-v1')); return saved.rooms[saved.current].invite; });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const friend = await context.newPage();
    await friend.goto(`${roomURL}?invite=${invite}`);
    await expect(chatButton(friend)).toBeVisible();
    await page.keyboard.press('t');
    await expect(input(page)).toBeFocused();
    await say('準備中のこんにちは🍓');
    await chatButton(friend).click();
    await expect(log(friend)).toContainText('準備中のこんにちは🍓');
    await expect(input(page)).toHaveValue('');
    await chatButton(friend).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'この席にすわる', exact: true }).first().click();
    await friend.getByRole('button', { name: 'この席にすわる', exact: true }).last().click();
    await page.getByRole('button', { name: 'じゅんびOK!', exact: true }).click();
    await friend.getByRole('button', { name: 'じゅんびOK!', exact: true }).click();
    await expect(page.getByRole('group', { name: '先攻・後攻のダイス' })).toBeVisible();
    await page.keyboard.press('t'); await say('対戦中でも会話できる');
    await friend.keyboard.press('t'); await expect(log(friend)).toContainText('対戦中でも会話できる');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    await page.getByRole('button', { name: 'ゲームメニュー', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'ゲームメニュー', exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'カード', exact: true }).click();
    await page.keyboard.press('t');
    await expect(input(page)).toBeFocused();
    await expect(menu).toBeVisible();
    await say('メニューからも話せる');
    await expect(log(friend)).toContainText('メニューからも話せる');
    await page.screenshot({ path: info.outputPath('menu-and-chat.png') });
    await page.keyboard.press('Escape'); await expect(menu).toBeVisible(); await expect(input(page)).toHaveCount(0);
    await friend.reload(); await chatButton(friend).click();
    await expect(log(friend)).toContainText('準備中のこんにちは🍓');
    await expect(log(friend)).toContainText('メニューからも話せる');
    await menu.getByRole('button', { name: 'ランチパッドに縮小' }).click();
    await menu.getByRole('tab', { name: 'ランチパッドホーム', exact: true }).click();
    await menu.getByRole('button', { name: 'ホーム', exact: true }).click();
    await page.getByRole('dialog', { name: 'ホームへ移動しますか？' }).getByRole('button', { name: '移動する', exact: true }).click();
    await expect(page).not.toHaveURL(roomURL);
    await chatButton(page).click();
    await expect(log(page)).toBeEmpty();
    await expect(input(page)).toHaveValue('');
    await expect(log(friend)).toContainText('メニューからも話せる');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

function playing() {
  let game = newGame([deck, deck], catalog, sandboxRules, 7);
  while (game.phase === 'dice') { game = run(game, { type: 'roll', actor: 0 }); if (game.phase === 'dice') game = run(game, { type: 'roll', actor: 1 }); }
  game = run(game, { type: 'initiative', actor: game.active, order: 'first' });
  for (const actor of [0, 1]) while (game.openingRemaining[actor] > 0) game = run(game, { type: 'openingDraw', actor, deck: 'yojo' });
  for (const actor of [0, 1]) game = run(game, { type: 'keep', actor });
  return game;
}

async function fixture(page) {
  const id = '123459', actions = []; let socket, fail = true;
  const view = { id, version: 1, status: 'lobby', match: 0, seat: 0, watching: true, spectators: 1,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, players: [null, null], game: null, last: null, resigned: null,
    plaza: { name: 'チャットのルーム', visibility: 'public', me: 'me', owner: 'me', creator: { name: 'あなた' }, chatEnabled: true, chat: [], members: [{ id: 'me', name: 'あなた', online: true }] } };
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123459\/socket/, ws => { socket = ws; ws.onMessage(bytes => {
    const request = JSON.parse(String(bytes)); actions.push(request);
    if (request.type === 'hello') ws.send(JSON.stringify({ type: 'view', view }));
    if (request.type !== 'action') return;
    if (fail) { fail = false; ws.send(JSON.stringify({ type: 'result', n: request.n, error: '送信できませんでした' })); return; }
    view.plaza.chat.push({ id: request.action.messageId, member: 'me', name: 'あなた', text: request.action.text, sentAt: Date.now() });
    ws.send(JSON.stringify({ type: 'chat', id, version: ++view.version, messages: view.plaza.chat }));
    ws.send(JSON.stringify({ type: 'result', n: request.n }));
  }); });
  await page.goto(`${base}/game/room/${id}/`); await expect(chatButton(page)).toBeVisible();
  return { actions, send: message => socket.send(JSON.stringify(message)), view };
}

for (const width of [1280, 390]) test(`chat handles IME, failed retries, long text, scrolling and out-of-order play updates (${width}px)`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const { actions, send, view } = await fixture(page);
  await chatButton(page).click();
  await input(page).fill('日本語の変換中');
  await input(page).dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(actions.filter(request => request.type === 'action')).toHaveLength(0);
  await input(page).press('t'); await expect(input(page)).toHaveValue('日本語の変換中t');
  await input(page).fill('<img src=x onerror=alert(1)>'); await input(page).press('Enter');
  await expect(page.locator('[data-room-chat]').getByRole('alert')).toHaveText('送信できませんでした');
  await expect(input(page)).toHaveValue('<img src=x onerror=alert(1)>');
  await input(page).press('Enter'); await expect(log(page)).toContainText('<img src=x onerror=alert(1)>');
  const retries = actions.filter(request => request.action?.action === 'chat');
  expect(retries).toHaveLength(2); expect(retries[0].action.messageId).toBe(retries[1].action.messageId);
  await expect(log(page).locator('img[src="x"]')).toHaveCount(0);
  await input(page).fill('🍓'.repeat(301)); await expect(input(page)).toHaveValue('🍓'.repeat(300));
  const messages = Array.from({ length: 50 }, (_, i) => ({ id: `message-${i}`, member: 'other', name: 'とても長い名前'.repeat(10), text: i === 49 ? 'a'.repeat(300) : `会話${i}`, sentAt: Date.now() + i }));
  send({ type: 'chat', id: view.id, version: 100, messages });
  await expect(log(page).locator('strong')).toHaveCount(50);
  send({ type: 'chat', id: view.id, version: 99, messages: [] });
  const game = playing();
  send({ type: 'view', view: { ...view, version: 3, status: 'playing', match: 1, game: viewFor(game, 'spectator'), players: game.players.map((player, i) => ({ member: `player-${i}`, name: player.name, online: true, ready: true })) } });
  await expect(page.locator('[data-table]')).toBeVisible();
  await expect(log(page).locator('strong')).toHaveCount(50);
  const sizes = await log(page).evaluate(element => ({ width: element.clientWidth, contentWidth: element.scrollWidth, height: element.clientHeight, contentHeight: element.scrollHeight }));
  expect(sizes.contentHeight).toBeGreaterThan(sizes.height); expect(sizes.contentWidth).toBeLessThanOrEqual(sizes.width + 1);
  await log(page).evaluate(element => { element.scrollTop = 0; });
  const bounds = await page.getByRole('region', { name: 'いまのルームの会話' }).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  await page.screenshot({ path: info.outputPath('spectator-chat.png') });
  send({ type: 'view', view: { ...view, version: 4, plaza: { ...view.plaza, chatEnabled: undefined } } });
  await expect(page.getByRole('button', { name: 'メッセージを送信', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(input(page)).toHaveCount(0);
});
