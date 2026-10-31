import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

async function finishDeal(hero) {
  const menu = hero.getByRole('navigation', { name: 'メニュー', exact: true });
  await menu.scrollIntoViewIfNeeded();
  await hero.locator('[data-hero-card], [data-hero-deck]').evaluateAll(async elements => {
    await Promise.all(elements.flatMap(element => element.getAnimations().map(animation => animation.finished)));
  });
  return menu;
}

for (const viewport of [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 1024, height: 768 }, { width: 1440, height: 1000 }, { width: 2560, height: 1080 },
]) {
  test(`hero covers the viewport width and keeps the original card navigation at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const hero = page.getByRole('region', { name: 'ぷぷりえーるを遊ぶ', exact: true });
    const illustration = hero.locator('img').first();
    await illustration.evaluate(image => image.decode());
    const logo = hero.getByRole('img', { name: 'お菓子争奪戦争ぷぷりえーる', exact: true });
    await expect(logo).toBeVisible();
    await logo.evaluate(image => image.decode());
    const menu = await finishDeal(hero);
    const art = await illustration.boundingBox(), mark = await logo.boundingBox();
    const screenWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(art.x)).toBeLessThan(1);
    expect(Math.abs(art.width - screenWidth)).toBeLessThan(1);
    await expect(illustration).toHaveCSS('object-fit', 'cover');
    // 写真の表示サイズに必要な画像を取得し、低解像度の画像を引き伸ばさない。
    const requestedWidth = await illustration.evaluate(image => Number(new URL(image.currentSrc).searchParams.get('w')));
    expect(requestedWidth).toBeGreaterThanOrEqual(Math.min(Math.max(art.width, art.height * 3000 / 2457), 2048));
    expect(mark.x).toBeGreaterThanOrEqual(art.x);
    expect(mark.x).toBeLessThan(art.x + art.width * .1);
    expect(mark.y).toBeLessThan(art.y + art.height * .1);
    expect((await menu.boundingBox()).y).toBeLessThan(art.y + art.height);
    await expect(menu.getByRole('link')).toHaveCount(3);
    for (const [name, href] of [['ぷぷりえーるとは', '/about/'], ['ゲームをプレイ', '/game/'], ['デッキをつくる', '/build/']]) {
      const entry = menu.getByRole('link', { name, exact: true });
      await expect(entry).toHaveAttribute('href', href);
      const card = await entry.boundingBox();
      expect(card.y).toBeGreaterThanOrEqual(art.y);
      expect(card.y + card.height).toBeLessThanOrEqual(art.y + art.height + (viewport.width <= 600 ? 56 : 0));
      expect(Math.abs(card.width / card.height - 220 / 320)).toBeLessThan(.002);
      await expect(entry.locator('img')).toBeVisible();
      await expect(entry.locator('img')).toHaveCSS('object-fit', 'cover');
      for (const line of name === 'ぷぷりえーるとは' ? ['ぷぷりえーる', 'とは'] : name === 'ゲームをプレイ' ? ['ゲームを', 'プレイ'] : ['デッキを', 'つくる']) {
        await expect(entry.getByText(line, { exact: true })).toBeVisible();
      }
      await entry.click({ trial: true });
      if (viewport.width <= 600) await entry.click({ trial: true, position: { x: card.width / 2, y: card.height - 12 } });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.addStyleTag({ content: 'nextjs-portal { display:none; }' });
    if (viewport.width <= 600) await page.screenshot({ path: info.outputPath('home-hero.png'), clip: { x: 0, y: 0, width: viewport.width, height: Math.ceil(art.y + art.height + 56) } });
    else await hero.screenshot({ path: info.outputPath('home-hero.png') });
    const finalCards = await menu.getByRole('link').evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    await hero.locator('[data-hero-card], [data-hero-deck]').evaluateAll(elements => elements.forEach(element => {
      const animation = element.getAnimations()[0]; animation.pause(); animation.currentTime = 600;
    }));
    const deck = await hero.locator('[data-hero-deck]').boundingBox();
    expect(deck.x).toBeGreaterThan(screenWidth * .7);
    expect(deck.x + deck.width).toBeLessThanOrEqual(screenWidth - 15);
    expect(deck.y).toBeGreaterThanOrEqual(art.y);
    for (const card of finalCards) {
      expect(deck.x >= card.x + card.width || deck.x + deck.width <= card.x
        || deck.y >= card.y + card.height || deck.y + deck.height <= card.y).toBe(true);
    }
    await hero.screenshot({ path: info.outputPath('deck-at-right-edge.png') });
  });
}

test('deck enters from the right, stops to deal, then leaves without fading or tilting', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: 'nextjs-portal { display:none; }' });
  const hero = page.getByRole('region', { name: 'ぷぷりえーるを遊ぶ', exact: true });
  const cards = hero.locator('[data-hero-card]');
  const pile = hero.locator('[data-hero-deck]');
  const seek = async time => hero.locator('[data-hero-card], [data-hero-deck]').evaluateAll((elements, time) => {
    elements.forEach(element => { const animation = element.getAnimations()[0]; animation.pause(); animation.currentTime = time; });
  }, time);
  const center = async element => element.evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; });
  await seek(0);
  expect((await pile.boundingBox()).x).toBeGreaterThanOrEqual(1280);
  await expect(pile).toHaveCSS('opacity', '1');
  await seek(600);
  const origin = await center(pile);
  expect(origin.x).toBeGreaterThan(640);
  expect((await pile.boundingBox()).x + (await pile.boundingBox()).width).toBeLessThan(1280);
  await hero.screenshot({ path: info.outputPath('deck-parked.png') });
  await seek(850);
  expect((await center(cards.first())).x).toBeLessThan(origin.x - 5);
  expect(Math.abs((await center(pile)).x - origin.x)).toBeLessThan(1);
  await expect(pile).toHaveCSS('opacity', '1');
  await hero.screenshot({ path: info.outputPath('deck-dealing.png') });
  await seek(1600);
  const lastCard = await cards.last().boundingBox();
  expect((await pile.boundingBox()).x).toBeGreaterThan(lastCard.x + lastCard.width);
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS('visibility', 'visible');
    await expect(card).toHaveCSS('opacity', '1');
    expect(await card.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).isIdentity)).toBe(true);
  }
  await seek(1900);
  expect((await center(pile)).x).toBeGreaterThan(origin.x + 5);
  await expect(pile).toHaveCSS('opacity', '1');
  await seek(2200);
  expect((await pile.boundingBox()).x).toBeGreaterThanOrEqual(1280);
  const link = cards.first().getByRole('link');
  await link.hover();
  await expect(link).toHaveCSS('transform', 'none');
  expect(await link.evaluate(element => getComputedStyle(element, '::after').content)).toBe('none');
  await link.click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test('reduced motion shows usable cards immediately without a pile or hover motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'ぷぷりえーるを遊ぶ', exact: true });
  await expect(hero.locator('[data-hero-deck]')).toHaveCSS('display', 'none');
  for (const card of await hero.locator('[data-hero-card]').all()) {
    await expect(card).toHaveCSS('opacity', '1');
    expect(await card.evaluate(element => element.getAnimations().length)).toBe(0);
    const link = card.getByRole('link');
    await link.hover(); await expect(link).toHaveCSS('transform', 'none');
    await link.click({ trial: true });
  }
});
