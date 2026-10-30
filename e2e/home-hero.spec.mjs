import { test, expect } from '@playwright/test';

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
    const art = await illustration.boundingBox(), mark = await logo.boundingBox();
    const screenWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(art.x)).toBeLessThan(1);
    expect(Math.abs(art.width - screenWidth)).toBeLessThan(1);
    expect(art.height).toBeGreaterThanOrEqual(viewport.height);
    await expect(illustration).toHaveCSS('object-fit', 'cover');
    // 縦長画面では幅より高さで画像が拡大されるため、必要な解像度も高さから確認する。
    const requestedWidth = await illustration.evaluate(image => Number(new URL(image.currentSrc).searchParams.get('w')));
    expect(requestedWidth).toBeGreaterThanOrEqual(Math.min(Math.max(art.width, art.height * 3000 / 2457), 2048));
    expect(mark.x).toBeGreaterThanOrEqual(art.x);
    expect(mark.x).toBeLessThan(art.x + art.width * .1);
    expect(mark.y).toBeLessThan(art.y + art.height * .1);
    const menu = hero.getByRole('navigation', { name: 'メニュー', exact: true });
    await expect(menu.getByRole('link')).toHaveCount(3);
    for (const [name, href] of [['ぷぷりえーるとは', '/about/'], ['ゲームをプレイ', '/game/'], ['デッキをつくる', '/build/']]) {
      const entry = menu.getByRole('link', { name, exact: true });
      await expect(entry).toHaveAttribute('href', href);
      const card = await entry.boundingBox();
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
    await page.screenshot({ path: info.outputPath('home-hero.png') });
  });
}
