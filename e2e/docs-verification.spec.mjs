import { test, expect } from '@playwright/test';
import { arena, field, hand } from '../packages/game-core/tests/helpers.mjs';

const base = process.env.PPLALE_GAME_TEST_URL ?? 'http://localhost:3000/game/';
const key = 'pplale-game-session-v2';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);

async function load(page, game) {
  game.players[0].name = 'あなた'; game.players[1].name = '相手';
  await page.goto(new URL('cpu/', base).href);
  await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
  await page.evaluate(({ key, game }) => localStorage.setItem(key, JSON.stringify({ game, mode: 'hotseat', level: 'normal' })), { key, game });
  await page.goto(new URL('play/', base).href);
  await expect(page.locator('[data-table]')).toBeVisible();
}

async function openSkills(page) {
  await page.getByRole('button', { name: 'あなたのスキル', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'スキル', exact: true });
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox(), viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.height).toBeLessThanOrEqual(viewport.height);
  return panel;
}

async function playCard(page, uid) {
  await page.locator(`[data-hand-list] [data-hand="${uid}"]`).click();
  await page.getByRole('button', { name: '場に出す', exact: true }).click();
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }, { width: 375, height: 812 }]) {
  test.describe(`${viewport.width}px remaining game checks`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      page.on('pageerror', error => { throw error; });
    });

    test('いのまこ shows the active passive, free skills and three common uses, then plays one', async ({ page }, info) => {
      const s = arena({ me: { playable: 'p_7', field: ['y_9'] } });
      const target = field(s)[0];
      s.players[0].played = ['y_15', 'y_16']; s.players[0].skills[0] = 3;
      s.cards[target].entered = s.turn;
      await load(page, s);
      const panel = await openSkills(page);
      await expect(panel.getByText('発動中', { exact: true })).toBeVisible();
      await expect(panel.getByRole('button').filter({ hasText: '突撃！隣のおやつタイム' })).toContainText('残り3回');
      const fast = panel.getByRole('button').filter({ hasText: 'つまみ食いなのー！' });
      await expect(fast).toContainText('0 PP');
      await fast.scrollIntoViewIfNeeded();
      await expect(fast).toBeInViewport();
      await page.screenshot({ path: info.outputPath('skill-panel.png') });
      await fast.click();
      await page.locator(`[data-unit="${target}"]`).click();
      await expect.poll(async () => (await saved(page)).cards[target].keywords.includes('fast')).toBe(true);
      expect((await saved(page)).players[0].pp).toBe(10);
      await page.reload();
      expect((await saved(page)).cards[target].keywords).toContain('fast');
    });

    test('ちょり shows its passive and reaction timing, and can immobilize an enemy', async ({ page }, info) => {
      const s = arena({ me: { playable: 'p_8' }, foe: { field: ['y_9'] } });
      const target = field(s, 1)[0];
      await load(page, s);
      const panel = await openSkills(page);
      const reaction = panel.getByRole('button').filter({ hasText: 'きんきゅーかいひー！' });
      await expect(reaction).toBeDisabled();
      await expect(reaction).toContainText('相手ターンに確認');
      const freeze = panel.getByRole('button').filter({ hasText: 'ちょりちゅけにむちゅーになれー！' });
      await freeze.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('chori-panel.png') });
      await freeze.click();
      await page.locator(`[data-unit="${target}"]`).click();
      await expect.poll(async () => (await saved(page)).cards[target].immobileUntil).toBe(s.turn + 1);
      expect((await saved(page)).players[0].pp).toBe(9);
    });

    test('ちょり reaction is offered on an attack and evades without consuming the dice Ex skill', async ({ page }) => {
      const s = arena({ me: { field: ['y_9'] }, foe: { playable: 'p_8', field: ['y_9'] } });
      const attacker = field(s)[0], target = field(s, 1)[0];
      s.cards[target].keywords.push('evade'); s.cards[target].evasion = 6;
      s.players[1].exSkills = { dice: { uses: 1 } };
      await load(page, s);
      await page.locator(`[data-unit="${attacker}"]`).click();
      await page.locator(`[data-unit="${target}"]`).click();
      await page.getByRole('button', { name: 'きんきゅーかいひー！を使う', exact: true }).click();
      await expect.poll(async () => (await saved(page)).players[1].nextPpDebt).toBe(2);
      const after = await saved(page);
      expect(after.players[1].skills[1]).toBe(0);
      expect(after.players[1].exSkills.dice.uses).toBe(1);
      expect(after.cards[attacker].exhausted).toBe(true);
      expect(after.cards[target].damage).toBe(0);
    });

    test('あみの and リンネ are both offered, and selecting あみの cancels the attack', async ({ page }) => {
      const s = arena({ me: { field: ['y_17'] }, foe: { field: ['y_17'], hand: ['y_91', 'y_33'], pp: 2 } });
      const attacker = field(s)[0], target = field(s, 1)[0], [amino, linne] = hand(s, 1);
      await load(page, s);
      await page.locator(`[data-unit="${attacker}"]`).click();
      await page.locator(`[data-unit="${target}"]`).click();
      await expect(page.getByText('手札の幼女で攻撃に対応しますか？', { exact: true })).toBeVisible();
      await expect(page.locator(`[data-hand-list] [data-hand="${linne}"]`)).toBeEnabled();
      await page.locator(`[data-hand-list] [data-hand="${amino}"]`).click();
      await expect.poll(async () => (await saved(page)).players[1].nap.includes(amino)).toBe(true);
      const after = await saved(page);
      expect(after.players[1].pp).toBe(0);
      expect(after.cards[target].damage).toBe(0);
      expect(after.players[1].hand).toContain(linne);
    });

    test('ぶらんちゃん offers manual payment and cancels the played card without paying PP', async ({ page }) => {
      const s = arena({ me: { hand: ['y_9'] }, foe: { hand: ['y_109', 'y_9', 's_19', 'y_17', 's_6'] } });
      const played = hand(s)[0], [bran, keep1, pay1, keep2, pay2] = hand(s, 1);
      await load(page, s);
      await playCard(page, played);
      await expect(page.getByText(/ぶらんちゃんと手札2枚を除外して/)).toBeVisible();
      await page.locator(`[data-hand-list] [data-hand="${bran}"]`).click();
      await page.locator(`[data-hand-list] [data-hand="${pay2}"]`).click();
      await page.locator(`[data-hand-list] [data-hand="${pay1}"]`).click();
      await expect.poll(async () => (await saved(page)).players[1].exile.length).toBe(3);
      const after = await saved(page);
      expect(after.players[1].hand).toEqual([keep1, keep2]);
      expect(after.players[0].nap).toContain(played);
      expect(after.players[0].pp).toBe(10);
      expect(after.players[0].played).toEqual([]);
    });

    test('メロンのレンテ acquires a skill that is shown, usable once, and preserved after reload', async ({ page }, info) => {
      const s = arena({ me: { hand: ['y_110'], pp: 12 }, foe: { playable: 'p_1', field: ['y_17'] } });
      const rente = hand(s)[0], target = field(s, 1)[0];
      await load(page, s);
      await playCard(page, rente);
      await page.getByRole('button', { name: /うぃまるの本気を見せまｽﾔｧ（/ }).click();
      await expect.poll(async () => (await saved(page)).players[0].extraSkills?.[0]?.uses).toBe(1);
      await page.reload();
      const panel = await openSkills(page);
      await expect(panel.getByRole('heading', { name: '相手から奪ったスキル', exact: true })).toBeAttached();
      const taken = panel.getByRole('button').filter({ hasText: 'うぃまるの本気を見せまｽﾔｧ' });
      await expect(taken).toContainText('1 PP');
      await expect(taken).toContainText('残り1回');
      await taken.scrollIntoViewIfNeeded();
      await expect(taken).toBeInViewport();
      await page.screenshot({ path: info.outputPath('taken-skill.png') });
      await taken.click();
      await page.locator(`[data-unit="${target}"]`).click();
      await expect.poll(async () => (await saved(page)).players[0].extraSkills[0].uses).toBe(0);
      expect((await saved(page)).cards[target].damage).toBe(2);
    });
  });
}

test('editor can filter melon cards and retain the selected card after reload', async ({ page }) => {
  await page.goto(new URL('editor/', base).href);
  await page.getByRole('button', { name: /新しい盤面を作る/ }).click();
  await page.getByRole('button', { name: '手札に加える', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'あなたの手札に置くカード', exact: true });
  await picker.getByLabel('フルーツで絞る').selectOption('melon');
  await picker.getByLabel('名前でさがす').fill('あみの');
  await picker.getByRole('button', { name: 'あみの（めろん）', exact: true }).click();
  await picker.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect.poll(async () => (await saved(page)).players[0].hand.length).toBe(1);
  await page.reload();
  const state = await saved(page);
  expect(state.cards[state.players[0].hand[0]].cardId).toBe('y_91');
});

test('375px game menu keeps every navigation tab inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(new URL('cpu/', base).href);
  const nav = page.getByRole('navigation', { name: 'ゲームメニュー' });
  await expect(nav.getByRole('link')).toHaveCount(8);
  for (const tab of await nav.getByRole('link').all()) {
    await expect(tab).toBeInViewport({ ratio: 1 });
    const size = await tab.evaluate(el => ({ content: el.scrollWidth, box: el.clientWidth }));
    expect(size.content).toBeLessThanOrEqual(size.box + 1);
  }
});
