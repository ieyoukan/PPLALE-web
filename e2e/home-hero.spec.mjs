import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

async function finishDeal(hero) {
  const menu = hero.getByRole('navigation', { name: 'メニュー', exact: true });
  await menu.scrollIntoViewIfNeeded();
  await expect(menu).toHaveAttribute('data-deal-state', 'playing');
  await hero.locator('[data-hero-card]').evaluateAll(async elements => {
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
    expect((await menu.boundingBox()).y).toBeGreaterThanOrEqual(art.y + art.height);
    await expect(menu.getByRole('link')).toHaveCount(3);
    for (const [name, href] of [['ぷぷりえーるとは', '/about/'], ['ゲームをプレイ', '/game/'], ['デッキをつくる', '/build/']]) {
      const entry = menu.getByRole('link', { name, exact: true });
      await expect(entry).toHaveAttribute('href', href);
      const card = await entry.boundingBox();
      expect(card.y).toBeGreaterThanOrEqual(art.y + art.height);
      expect(Math.abs(card.width / card.height - 220 / 320)).toBeLessThan(.002);
      await expect(entry.locator('img')).toBeVisible();
      await expect(entry.locator('img')).toHaveCSS('object-fit', 'cover');
      for (const line of name === 'ぷぷりえーるとは' ? ['ぷぷりえーる', 'とは'] : name === 'ゲームをプレイ' ? ['ゲームを', 'プレイ'] : ['デッキを', 'つくる']) {
        await expect(entry.getByText(line, { exact: true })).toBeVisible();
      }
      await entry.click({ trial: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.addStyleTag({ content: 'nextjs-portal { display:none; }' });
    await hero.screenshot({ path: info.outputPath('home-hero.png') });
  });
}

test('cards deal from one visible pile in sequence and tilt on hover without covering the photo', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: 'nextjs-portal { display:none; }' });
  const hero = page.getByRole('region', { name: 'ぷぷりえーるを遊ぶ', exact: true });
  const cards = hero.locator('[data-hero-card]');
  await expect(cards).toHaveCount(3);
  const timings = await cards.evaluateAll(elements => elements.map(element => {
    const animation = element.getAnimations()[0];
    animation.pause(); animation.currentTime = 0;
    const timing = animation.effect.getTiming();
    return { delay: timing.delay, duration: timing.duration };
  }));
  const pile = hero.locator('[data-hero-deck]');
  await pile.evaluate(element => { const animation = element.getAnimations()[0]; animation.pause(); animation.currentTime = 0; });
  const center = element => element.evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; });
  const origin = await center(pile);
  for (const card of await cards.all()) {
    const start = await center(card);
    expect(Math.abs(start.x - origin.x)).toBeLessThan(2);
    expect(Math.abs(start.y - origin.y)).toBeLessThan(2);
  }
  expect(timings[0].delay).toBeLessThan(timings[1].delay);
  expect(timings[1].delay).toBeLessThan(timings[2].delay);
  await hero.screenshot({ path: info.outputPath('deck-before-dealing.png') });
  await cards.evaluateAll((elements, time) => elements.forEach(element => { element.getAnimations()[0].currentTime = time; }), timings[1].delay - 10);
  expect((await center(cards.first())).x).toBeLessThan(origin.x - 5);
  expect(Math.abs((await center(cards.last())).x - origin.x)).toBeLessThan(2);
  await hero.screenshot({ path: info.outputPath('deck-first-card.png') });
  await cards.evaluateAll(elements => elements.forEach(element => element.getAnimations()[0].finish()));
  await pile.evaluate(element => element.getAnimations()[0].finish());
  await expect(pile).toHaveCSS('opacity', '0');
  const link = cards.first().getByRole('link');
  await link.hover();
  await link.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)); });
  expect(await link.evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
  const photo = await hero.locator('img').first().boundingBox();
  expect((await link.boundingBox()).y).toBeGreaterThanOrEqual(photo.y + photo.height);
  await hero.screenshot({ path: info.outputPath('card-hover.png') });
  // 配られている途中のカードも、クリックで位置が飛ばずにリンクを開ける。
  await cards.first().evaluate(element => {
    const animation = element.getAnimations()[0], timing = animation.effect.getTiming();
    animation.pause(); animation.currentTime = timing.delay + Number(timing.duration) / 2;
  });
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
