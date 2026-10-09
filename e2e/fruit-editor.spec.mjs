import { test, expect } from '@playwright/test';
const key = 'pplale-game-session-v2';
const session = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

async function preset(page, title) {
  await page.goto('/game/editor/');
  await page.getByRole('button').filter({ hasText: title }).click();
  await expect(page.getByRole('toolbar', { name: '盤面エディタ' })).toBeVisible();
}
async function playBoard(page) {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('button', { name: 'この盤面で遊ぶ', exact: true }).click();
  await page.getByRole('button', { name: '両側を自分で操作する' }).click();
  await expect(page.getByRole('toolbar', { name: '盤面エディタ' })).toBeHidden();
}

test('editor selects both new fruits and preserves counters, Ex uses and card traits after reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/game/editor/');
  await page.getByRole('button', { name: /新しい盤面を作る/ }).click();
  await page.getByRole('button', { name: '手札に加える', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'あなたの手札に置くカード' });
  await picker.getByLabel('フルーツで絞る').selectOption('grape');
  await picker.getByLabel('名前でさがす').fill('ほーずき');
  await picker.getByRole('button', { name: 'ほーずき（ぶどう）', exact: true }).click();
  await picker.getByLabel('フルーツで絞る').selectOption('orange');
  await picker.getByLabel('名前でさがす').fill('キラチャン');
  await picker.getByRole('button', { name: 'キラチャン（おれんじ）', exact: true }).click();
  await picker.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'あなたの設定', exact: true }).click();
  await page.getByRole('button', { name: 'アイスカウントを1増やす', exact: true }).click();
  await page.getByRole('button', { name: 'どんぐりカウントを1増やす', exact: true }).click();
  await page.getByRole('button', { name: 'クマはサイコロを振らない', exact: true }).click();
  await page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
  await page.locator('[data-side="0"][data-slot="0"]').click();
  await page.getByLabel('フルーツで絞る').selectOption('grape');
  await page.getByLabel('名前でさがす').fill('ふろんと');
  await page.getByRole('button', { name: 'ふろんとさん（ぶどう）', exact: true }).click();
  await page.locator('[data-side="0"][data-slot="0"]').click();
  await page.getByRole('button', { name: 'おにごっこ成功条件（1d6≧）を1減らす', exact: true }).click();
  await page.reload();
  const saved = await session(page), p = saved.game.players[0];
  expect(p.hand.map(uid => saved.game.cards[uid].cardId)).toEqual(['y_31', 'y_116']);
  expect(p.ice).toBe(1); expect(p.acorns).toBe(1); expect(p.exSkills.dice.uses).toBe(1);
  expect(saved.game.cards[p.field[0]].evasion).toBe(4);
  expect(errors).toEqual([]);
});

test('grape sample plays selected evasion and still offers the cafe bonus draw', async ({ page }) => {
  await preset(page, 'ぶどう：公開手札とおにごっこ');
  await playBoard(page);
  const before = (await session(page)).game, target = before.players[1].field[0], sweet = before.players[0].hand.find(uid => before.cards[uid].cardId === 's_6');
  await page.locator(`[data-hand-list] [data-hand="${sweet}"]`).click();
  await page.getByRole('button', { name: '使う', exact: true }).click();
  await page.locator(`[data-unit="${target}"]`).click();
  await page.getByRole('button', { name: /出目を6にする/ }).click();
  await expect(page.locator('[data-deck="0-yojo"]')).toBeEnabled({ timeout: 15000 });
  await page.locator('[data-deck="0-yojo"]').click();
  await expect.poll(async () => (await session(page)).game.players[0].hand.length).toBe(5);
  const after = (await session(page)).game;
  expect(after.cards[target].damage).toBe(0); expect(after.players[1].exSkills.dice.uses).toBe(1);
});

test('orange sample acquires Alice and uses it through the skill panel', async ({ page }) => {
  await preset(page, 'オレンジ：色おに・除外・Exスキル');
  await playBoard(page);
  const before = (await session(page)).game, unit = before.players[0].hand.find(uid => before.cards[uid].cardId === 'y_142');
  await page.locator(`[data-hand-list] [data-hand="${unit}"]`).click();
  await page.getByRole('button', { name: '場に出す', exact: true }).click();
  await expect.poll(async () => (await session(page)).game.players[0].exSkills.alice?.uses).toBe(1);
  await page.getByRole('button', { name: 'あなたのスキル', exact: true }).click();
  await page.getByRole('button', { name: /不思議の国のアリス/ }).click();
  await expect.poll(async () => (await session(page)).game.cards[unit].attackBonus).toBe(3);
  const after = (await session(page)).game;
  expect(after.players[0].field.every(uid => after.cards[uid].hpBonus === 3)).toBe(true);
});

test('orange sample color protection blocks the attack and its all-target damage', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await preset(page, 'オレンジ：色おに・除外・Exスキル');
  await playBoard(page);
  const before = (await session(page)).game, attacker = before.players[0].field[0], target = before.players[1].field[0];
  await page.locator(`[data-unit="${attacker}"]`).click();
  await page.locator(`[data-unit="${target}"]`).click();
  await expect.poll(async () => (await session(page)).game.cards[attacker].exhausted).toBe(true);
  const after = (await session(page)).game;
  expect(after.cards[target].damage).toBe(0); expect(after.players[1].field).toContain(target);
  // The defender still deals retaliation damage. Its attacker dies, so the acquired abyss reduces one point.
  expect(after.players[0].field).not.toContain(attacker); expect(after.players[0].exSkills.abyss.uses).toBe(1); expect(after.players[1].points).toBe(11);
  expect(errors).toEqual([]);
});
