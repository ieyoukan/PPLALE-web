// 招待制の検証用ルームだけを使い、実サーバーへの送信とブラウザの表示開始を測る。
// 例: node scripts/probe-room-play.mjs https://pplale.vercel.app https://pplale-room.youkan.uk /tmp/play-before.json
// --force-wait は、表示待ちを再現する固定乱数をブラウザに入れる比較条件。
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';

const require = createRequire(new URL('../services/room-server/package.json', import.meta.url));
const WebSocket = require('ws');
const [web, server, output] = process.argv.slice(2);
if (!web || !server || !output) throw new Error('Usage: probe-room-play.mjs <web URL> <room server URL> <output JSON> [--force-wait]');
const forced = process.argv.includes('--force-wait');
const deck = { name: '通信検証', playable: 'p_0', yojo: Array(20).fill('y_2'), sweet: Array(10).fill('s_19') };
const deviceKeys = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
async function post(path, body, side = 0) {
  const response = await fetch(`${server}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: web, 'x-history-key': deviceKeys[side] }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Room API returned ${response.status}`);
  return response.json();
}
async function connect(id, token) {
  const socket = new WebSocket(`${server.replace(/^http/, 'ws')}/rooms/${id}/socket`, { headers: { origin: web } });
  let latest, sequence = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.type === 'view') latest = message.view;
    if (message.type === 'result') pending.get(message.n)?.(message);
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'hello', token }));
  const client = {
    view: () => latest,
    async until(check) {
      const limit = Date.now() + 20_000;
      while (!latest || !check(latest)) {
        if (Date.now() > limit) throw new Error('Room state did not arrive');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return latest;
    },
    act(action) {
      const n = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(n); reject(new Error('Room action timed out')); }, 15_000);
        pending.set(n, message => { clearTimeout(timer); pending.delete(n); if (message.error) reject(new Error(message.error)); else resolve(message); });
        socket.send(JSON.stringify({ type: 'action', n, action }));
      });
    },
    close: () => socket.close(),
  };
  await client.until(() => true);
  return client;
}

const browser = await chromium.launch();
const clients = [];
let context;
try {
  const made = await post('/rooms', { rules: { fruits: ['strawberry', 'grape', 'melon'], extendedPlayable: true }, name: '検証', plaza: { name: '通信検証（自動）', visibility: 'invite' } });
  const id = made.view.id;
  const other = await post(`/rooms/${id}/join`, { name: '検証', plaza: true, invite: made.view.plaza.invite }, 1);
  clients.push(await connect(id, made.token), await connect(id, other.token));
  for (const side of [0, 1]) await clients[side].act({ action: 'sit', seat: side });
  for (const side of [0, 1]) await clients[side].act({ action: 'ready', deck });
  await clients[0].until(view => view.game?.phase === 'dice');
  const command = async (side, action) => {
    const result = await clients[side].act({ action: 'command', command: { ...action, actor: side }, revision: clients[side].view().game.revision });
    if (result.revision !== undefined) await Promise.all(clients.map(client => client.until(view => view.game?.revision >= result.revision)));
    return result;
  };
  for (let round = 0; clients[0].view().game.phase === 'dice' && round < 10; round++) {
    await command(0, { type: 'roll' }); await command(1, { type: 'roll' });
  }
  const winner = clients[0].view().game.active;
  await command(winner, { type: 'initiative', order: winner === 0 ? 'first' : 'second' });
  for (const side of [0, 1]) while (clients[side].view().game.openingRemaining[side]) await command(side, { type: 'openingDraw', deck: 'yojo' });
  for (const side of [0, 1]) await command(side, { type: 'keep' });
  await command(0, { type: 'choose', option: 'yojo' });
  context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ja-JP' });
  await context.addInitScript(({ id, token, invite, forced, historyKey }) => {
    localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token, invite, at: Date.now() } } }));
    localStorage.setItem('pplale-history-key-v1', historyKey);
    localStorage.setItem('pplale-show-assessment', 'hidden');
    if (forced) Math.random = () => .2;
  }, { id, token: made.token, invite: made.view.plaza.invite, forced, historyKey: deviceKeys[0] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${web}/game/room/${id}/`);
  const end = page.getByRole('button', { name: /ターン\s*終了/ });
  const measurements = [];
  for (let turn = 1; turn <= 2; turn++) {
    if (turn > 1) {
      await command(0, { type: 'end' });
      await command(1, { type: 'choose', option: 'yojo' });
      await command(1, { type: 'end' });
      await command(0, { type: 'choose', option: 'yojo' });
    }
    for (let count = 0; count < turn; count++) {
      await end.waitFor({ state: 'visible', timeout: 25_000 });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => /ターン\s*終了/.test(button.textContent) && !button.disabled), null, { timeout: 25_000 });
      const uid = clients[0].view().game.players[0].hand[0];
      await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
      await page.evaluate(uid => {
        const result = window.playProbe = { input: null, feedback: null, confirmed: null, preview: false, duration: null };
        const observer = new MutationObserver(() => {
          const preview = document.querySelector(`[data-pending-play="${uid}"]`), actual = document.querySelector(`[data-unit="${uid}"]`);
          if (result.input === null) return;
          if (result.feedback === null && (preview || actual)) {
            result.preview = !!preview;
            result.duration = getComputedStyle((preview || actual).querySelector('img') ?? (preview || actual)).animationDuration;
            requestAnimationFrame(() => requestAnimationFrame(() => { result.feedback ??= performance.now() - result.input; }));
          }
          if (actual && result.confirmed === null) { result.confirmed = performance.now() - result.input; observer.disconnect(); }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        const input = event => {
          if (!event.target.closest('button')?.textContent.includes('場に出す')) return;
          result.input = performance.now(); document.removeEventListener('click', input, true);
        };
        document.addEventListener('click', input, true);
      }, uid);
      await page.getByRole('button', { name: '場に出す', exact: true }).click();
      await page.locator(`[data-unit="${uid}"]`).waitFor({ timeout: 15_000 });
      await page.waitForFunction(() => window.playProbe.feedback !== null);
      measurements.push(await page.evaluate(() => ({ feedbackMs: window.playProbe.feedback, confirmedMs: window.playProbe.confirmed, preview: window.playProbe.preview, animationDuration: window.playProbe.duration })));
    }
  }
  await page.waitForTimeout(1200);
  const samples = await page.evaluate(() => JSON.parse(localStorage.getItem('pplale-room-performance-v1') ?? '[]'));
  const stats = await fetch(`${server}/stats`).then(response => response.json());
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), web, server, serverVersion: stats.version, forcedPresentationWait: forced, note: 'Private guest test room; 3 real plays. Fixed random only reproduces the client presentation wait; network is real. No room IDs or tokens are exported.', measurements, samples, errors }, null, 2));
  console.log(JSON.stringify({ output, serverVersion: stats.version, forced, measurements, errors }));
} finally {
  await context?.close();
  for (const client of clients) { try { await client.act({ action: 'leave' }); } catch {} client.close(); }
  await browser.close();
}
