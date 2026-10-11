// The rules of a CPU match, chosen on the tiles of the preparation page (/game/): they decide
// which decks can be chosen, and the match that starts keeps them.
//   PPLALE_GAME_TEST_URL=http://localhost:3100/game/ npx playwright test match-rules
import { test, expect } from '@playwright/test';
import { fruitNames, fruits, playableNow } from '../packages/game-core/dist/index.js';
import { catalog } from '../packages/game-core/tests/helpers.mjs';

const url = process.env.PPLALE_GAME_TEST_URL ?? 'http://localhost:3000/game/';
const savedSetup = page => page.evaluate(() => JSON.parse(localStorage.getItem('pplale-game-session-v2') ?? 'null')?.setup);

test('the rule tiles decide which decks can be chosen, and the match keeps the rules', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const tile = fruit => page.getByRole('checkbox', { name: new RegExp(fruitNames[fruit]) });
  const beta = page.getByRole('checkbox', { name: /拡張プレイアブル/ });

  // Every fruit and 拡張プレイアブル (ExP) has a tile; what the game cannot play yet cannot be chosen.
  for (const fruit of fruits) await expect(tile(fruit)).toBeEnabled({ enabled: playableNow.fruits.includes(fruit) });
  await expect(beta).toBeEnabled({ enabled: playableNow.extendedPlayable });
  await expect(tile('strawberry')).toBeChecked();
  await expect(beta).not.toBeChecked();
  const decks = page.getByRole('combobox');
  await expect(decks).toHaveCount(2);
  for (const deck of await decks.all()) await expect(deck.locator('option:checked')).toHaveText(/いちごのおためしデッキ/);

  // The fruits are an environment: いちご, then ぶどう, メロン, オレンジ added in that order.
  // いちご cannot be taken away; choosing a fruit takes the ones before it, taking one away the ones after it.
  await tile('strawberry').click();
  await expect(tile('strawberry')).toBeChecked();
  await tile('orange').check();
  for (const fruit of fruits) await expect(tile(fruit)).toBeChecked();
  await tile('melon').uncheck();
  await expect(tile('grape')).toBeChecked();
  for (const fruit of ['melon', 'orange']) await expect(tile(fruit)).not.toBeChecked();

  // いちご＋ぶどう with おまかせデッキ on both sides.
  for (const deck of await decks.all()) await deck.selectOption('random:deck');

  // The match starts with two decks of the allowed fruits and keeps its rules (for the rematch).
  await page.getByRole('button', { name: /対戦をはじめる/ }).click();
  await page.waitForURL(/\/game\/play\//);
  await expect.poll(async () => (await savedSetup(page))?.matchRules).toEqual({ fruits: ['strawberry', 'grape'], extendedPlayable: false });
  const setup = await savedSetup(page);
  for (const deck of setup.decks) {
    expect([deck.yojo.length, deck.sweet.length]).toEqual([20, 10]);
    for (const id of [...deck.yojo, ...deck.sweet]) expect(['strawberry', 'grape']).toContain(catalog[id].fruit);
  }

  // The next match is prepared from the same rules.
  await page.goto(url);
  await expect(tile('grape')).toBeChecked();
  await expect(tile('melon')).not.toBeChecked();
  expect(errors).toEqual([]);
});
