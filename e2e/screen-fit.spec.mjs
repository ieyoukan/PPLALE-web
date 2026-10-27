import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { arena, catalog, field, run } from '../packages/game-core/tests/helpers.mjs';
import { positionOf } from '../packages/game-core/dist/index.js';
import { restoreGame } from '../packages/game-core/dist/snapshot.js';

const deck = JSON.parse(readFileSync(new URL('../src/data/strawberryStableDeck.json', import.meta.url)));
const recording = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/replay-v1.json.gz', import.meta.url))));
const phones = [{ width: 320, height: 480 }, { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 667, height: 320 }];
const screens = [...phones, { width: 1280, height: 720 }];

async function fitsPage(page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth <= innerWidth + 1, height: document.documentElement.scrollHeight <= innerHeight + 1 }))).toEqual({ width: true, height: true });
}
async function fitsResult(result) {
  await expect(result).toBeVisible();
  await expect.poll(() => result.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  const actions = result.getByRole('group', { name: '対戦後の操作' });
  for (const button of await actions.getByRole('button').all()) await expect(button).toBeInViewport({ ratio: .999 });
  for (const button of await actions.getByRole('button').all()) {
    const box = await button.boundingBox(), viewport = button.page().viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(-.5); expect(box.y).toBeGreaterThanOrEqual(-.5);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + .5); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + .5);
  }
  const boxes = await result.evaluate(element => {
    const heading = element.querySelector('header').getBoundingClientRect(), buttons = element.querySelector('[aria-label="対戦後の操作"]').getBoundingClientRect();
    return { header: heading.toJSON(), buttons: buttons.toJSON(), rotated: element.closest('[data-game-stage]').hasAttribute('data-rotated') };
  });
  if (boxes.rotated) expect(boxes.header.right).toBeLessThanOrEqual(boxes.buttons.left);
  else expect(boxes.header.bottom).toBeLessThanOrEqual(boxes.buttons.top);
  expect(await result.evaluate(element => element.scrollTop)).toBe(0);
}
function finishedSession() {
  // Restore twice so migrated flags have the same key order as a browser's next restore.
  const initial = restoreGame(restoreGame(arena({ me: { field: Array(6).fill('y_3') }, foe: { points: 6 } }), catalog), catalog);
  let game = initial;
  const commands = [];
  const act = command => { commands.push(command); game = run(game, command); };
  for (const uid of field(initial)) {
    act({ type: 'attack', actor: 0, uid, target: 'leader' });
    while (game.pending && game.winner === null) act({ type: 'choose', actor: game.pending.task.actor, option: 'sweet' });
  }
  const points = [{ index: 0, win: .5, turn: { order: 'first', number: 2 }, graded: true }, ...commands.map((command, index) => ({ index: index + 1, win: index % 2 ? .8 : .2, turn: { order: 'first', number: 2 }, command, label: '長いカード名を含む形勢の変化を確認するためのテスト', graded: true, ...(command.actor === 0 && index % 2 === 0 ? { grade: 'blunder', loss: .3 } : {}) }))];
  return { game, initial, commands, points, mode: 'cpu', levels: ['normal', 'normal'], reported: true, position: { ...positionOf(initial, catalog), title: '画面の中に収めるための長い盤面名の確認' }, setup: { decks: [{ ...deck, name: '長いデッキ名でも操作ボタンを押し出さないための確認デッキ' }, deck], rules: game.rules } };
}

for (const viewport of phones) {
  test.describe(`home fits ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('all navigation and setup actions fit, including a resumed match and CPU spectating', async ({ page }, info) => {
      await page.addInitScript(() => localStorage.setItem('pplale-install-dismissed-v1', String(Date.now())));
      await page.goto('/game/cpu/');
      await expect(page.locator('[data-game-stage]')).toBeVisible({ timeout: 15000 });
      const start = page.getByRole('button', { name: '対戦をはじめる', exact: false });
      await expect(start).toBeInViewport({ ratio: .999 });
      const nav = page.getByRole('dialog', { name: 'ゲームメニュー' }).getByRole('tablist', { name: 'ゲームの画面' });
      for (const tab of await nav.getByRole('tab').all()) await expect(tab).toBeInViewport({ ratio: .999 });
      await fitsPage(page);
      const rules = page.getByRole('region', { name: '対戦のルール', exact: true });
      await expect(rules).toBeVisible();
      await expect(page.getByRole('dialog', { name: '対戦のルール', exact: true })).toHaveCount(0);
      for (const checkbox of await rules.getByRole('checkbox').all()) await expect(checkbox).toBeInViewport({ ratio: .999 });
      await rules.getByRole('checkbox', { name: 'おれんじ' }).check();
      await rules.getByRole('checkbox', { name: /拡張プレイアブル/ }).check();
      await expect(rules.getByRole('checkbox', { name: 'ぶどう' })).toBeChecked();
      await fitsPage(page);
      await page.evaluate(game => localStorage.setItem('pplale-game-session-v2', JSON.stringify({ game, mode: 'cpu', levels: ['normal', 'normal'] })), arena());
      await page.reload();
      await page.getByRole('button', { name: 'CPU同士を観戦', exact: true }).click();
      await rules.getByRole('checkbox', { name: 'おれんじ' }).check();
      await rules.getByRole('checkbox', { name: /拡張プレイアブル/ }).check();
      for (const groupName of ['CPU 1の強さ', 'CPU 2の強さ']) {
        const group = page.getByRole('group', { name: groupName, exact: true });
        for (const button of await group.getByRole('button').all()) await expect(button).toBeInViewport({ ratio: .999 });
      }
      await expect(start).toBeInViewport({ ratio: .999 });
      for (const select of await page.locator('select').all()) await expect(select).toBeInViewport({ ratio: .999 });
      await fitsPage(page);
      await page.screenshot({ path: info.outputPath('home-watch.png') });
      const box = await start.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      // Match assets are prepared before navigation, including the full expanded pool.
      await expect(page).toHaveURL(/\/game\/play\//, { timeout: 30000 });
    });
  });
}

for (const viewport of screens) {
  test.describe(`result fits ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('analysis, deck and editor details never push the replay/home/rematch actions off screen', async ({ page }, info) => {
      const fixture = finishedSession();
      await page.goto('/game/cpu/');
      await expect(page.locator('[data-game-stage]')).toBeVisible({ timeout: 15000 });
      await page.evaluate(fixture => {
        const { points, ...session } = fixture;
        localStorage.setItem('pplale-game-session-v2', JSON.stringify(session));
        localStorage.setItem('pplale-show-assessment', 'shown');
        localStorage.setItem('pplale-game-assessment-v1', JSON.stringify({ version: 1, source: JSON.stringify(fixture.initial), viewer: 0, commands: fixture.commands, points }));
      }, fixture);
      await page.goto('/game/play/');
      const result = page.getByRole('dialog', { name: '対戦結果', exact: true });
      await expect(result.getByRole('button', { name: '形勢の詳細', exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await fitsResult(result);
      await result.getByRole('button', { name: 'コードをコピー', exact: true }).click();
      await expect(result.locator('textarea')).toBeVisible();
      await fitsResult(result);
      await page.screenshot({ path: info.outputPath('result.png') });
      await result.getByRole('button', { name: '形勢の詳細', exact: true }).click();
      const details = page.getByRole('dialog', { name: '形勢の詳細', exact: true });
      await expect(details).toContainText('悪手');
      await page.keyboard.press('Escape');
      await expect(details).toHaveCount(0);
      await expect(result.getByRole('button', { name: '形勢の詳細', exact: true })).toBeFocused();
      const replay = result.getByRole('button', { name: 'リプレイ', exact: true }), box = await replay.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByRole('region', { name: 'リプレイの再生', exact: true })).toBeVisible();
    });
    test('recorded results fit with full-length profile names', async ({ page }) => {
      const fixture = structuredClone(recording);
      fixture.match.players[0].name = '十二文字のプロフィール名';
      fixture.match.players[1].name = '対戦相手のプロフィール名';
      await page.route('**/history/**', route => new URL(route.request().url()).pathname.startsWith('/history/') ? route.fulfill({ json: fixture }) : route.continue());
      await page.goto(`/game/replay/?id=${fixture.match.id}&step=${fixture.frames.length - 1}`);
      const result = page.getByRole('dialog', { name: '対戦結果', exact: true });
      await fitsResult(result);
      await expect(result.getByRole('region', { name: /の形勢の推移/ })).toBeVisible();
      await expect(result.getByRole('button', { name: '対戦履歴へ戻る', exact: true })).toBeInViewport({ ratio: .999 });
    });
  });
}

for (const viewport of [{ width: 320, height: 480 }, { width: 667, height: 320 }]) {
  test.describe(`learning status fits ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('the learning opt-out and start action fit together', async ({ page }) => {
      test.skip(process.env.PPLALE_CPU_LAYOUT_TEST !== '1', 'Run with a local app configured with a mock CPU server URL');
      await page.addInitScript(() => {
        localStorage.setItem('pplale-install-dismissed-v1', String(Date.now()));
        localStorage.setItem('pplale-cpu-learning-consent-v1', 'agreed');
      });
      await page.goto('/game/cpu/');
      await expect(page.locator('[data-game-stage]')).toBeVisible({ timeout: 15000 });
      const strength = page.getByRole('combobox', { name: 'CPUの強さ', exact: true });
      if (await strength.isVisible()) await strength.selectOption('master');
      else await page.getByRole('button', { name: 'さいきょう', exact: true }).click();
      const stop = page.getByRole('button', { name: '送るのをやめる', exact: true });
      await expect(stop).toBeInViewport({ ratio: .999 });
      await expect(page.getByRole('button', { name: '対戦をはじめる', exact: false })).toBeInViewport({ ratio: .999 });
      await expect(page.getByRole('button', { name: 'ログイン', exact: true })).toBeInViewport({ ratio: .999 });
      await fitsPage(page);
      await stop.click();
      await expect(stop).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('pplale-cpu-learning-consent-v1'))).toBeNull();
    });
  });
}

test.describe('shared landscape game frame', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('menus, card details and waiting screens share one landscape stage across rotations', async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem('pplale-install-dismissed-v1', String(Date.now())));
    await page.goto('/game/cpu/');
    await expect(page.locator('[data-game-stage]')).toBeVisible({ timeout: 15000 });
    const stage = page.locator('[data-game-stage]');
    await expect(stage).toHaveCount(1);
    await expect(stage).toHaveAttribute('data-rotated', 'true');
    const layout = () => stage.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
    expect((await layout()).width).toBeGreaterThan((await layout()).height);
    // The game's screens open in the launchpad: its tabs, and 通知 among the icons at the top right.
    const pad = page.getByRole('dialog', { name: 'ゲームメニュー' }), nav = pad.getByRole('tablist', { name: 'ゲームの画面' });
    for (const label of ['バトル', 'カード', '盤面エディタ', 'ソーシャル', '通知', 'CPU対決']) {
      await pad.getByRole('tab', { name: label, exact: true }).click();
      await expect(pad.getByRole('heading', { level: 2, name: label, exact: true })).toBeInViewport({ ratio: .999, timeout: 15000 });
      await expect(stage).toHaveCount(1);
      await expect(stage).toHaveAttribute('data-rotated', 'true');
      await fitsPage(page);
    }
    await nav.getByRole('tab', { name: 'ソーシャル' }).click();
    await pad.locator('a[href="/game/profile/"]').first().click();
    await expect(pad.getByRole('heading', { level: 2, name: 'プロフィール', exact: true })).toBeVisible();
    await nav.getByRole('tab', { name: 'カード' }).click();
    await page.getByRole('link', { name: /^図鑑/ }).click();
    await page.locator('li button').first().click();
    const viewer = page.getByRole('dialog').last(); // The card viewer, over the launchpad's own dialog.
    await expect(viewer).toBeInViewport({ ratio: .999 });
    await expect(viewer.getByRole('button', { name: '閉じる', exact: true })).toBeInViewport({ ratio: .999 });
    await page.screenshot({ path: info.outputPath('landscape-card-details.png') });
    await viewer.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(stage).not.toHaveAttribute('data-rotated');
    await fitsPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(stage).toHaveAttribute('data-rotated', 'true');
    const pane = await pad.getByRole('tabpanel').elementHandle();
    await pane.evaluate(element => { element.scrollTop = 500; });
    expect(await pane.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await nav.getByRole('tab', { name: 'CPU対決' }).click();
    await expect(page.getByRole('button', { name: '対戦をはじめる', exact: false })).toBeInViewport({ ratio: .999 });
    expect(await pane.evaluate(element => element.scrollTop)).toBe(0);
    await page.goto('/game/replay/');
    await expect(page.getByRole('status')).toContainText('リプレイが見つかりません');
    await expect(stage).toHaveCount(1);
    await expect(stage).toHaveAttribute('data-rotated', 'true');
    await fitsPage(page);
  });
});

for (const allowed of [true, false]) {
  test.describe(`native landscape ${allowed ? 'available' : 'refused'}`, () => {
    test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
    test('a menu tap requests landscape and keeps the stage usable if refused', async ({ page }) => {
      await page.addInitScript(allowed => {
        localStorage.setItem('pplale-install-dismissed-v1', String(Date.now()));
        window.landscapeCalls = [];
        Object.defineProperty(document, 'fullscreenEnabled', { get: () => true });
        Element.prototype.requestFullscreen = async () => {
          window.landscapeCalls.push('fullscreen');
          if (!allowed) throw new Error('Unavailable');
        };
        screen.orientation.lock = async orientation => {
          window.landscapeCalls.push(orientation);
          if (!allowed) throw new Error('Unavailable');
        };
      }, allowed);
      await page.goto('/game/cpu/');
      await expect(page.locator('[data-game-stage]')).toBeVisible({ timeout: 15000 });
      // These native browser actions must retain their user gesture.
      await page.getByRole('button', { name: 'ログイン', exact: true }).dispatchEvent('pointerup');
      await page.getByRole('combobox').first().dispatchEvent('pointerup');
      expect(await page.evaluate(() => window.landscapeCalls)).toEqual([]);
      await page.getByRole('button', { name: 'CPU同士を観戦', exact: true }).tap();
      await expect.poll(() => page.evaluate(() => window.landscapeCalls)).toEqual(['fullscreen', 'landscape']);
      await expect(page.locator('[data-game-stage]')).toHaveCount(1);
      await expect(page.getByRole('button', { name: '対戦をはじめる', exact: false })).toBeInViewport({ ratio: .999 });
      await fitsPage(page);
    });
  });
}
