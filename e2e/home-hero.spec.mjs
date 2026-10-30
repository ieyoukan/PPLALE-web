import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`hero keeps the supplied illustration visible with the logo in its top left at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const hero = page.getByRole('region', { name: 'ぷぷりえーるを遊ぶ', exact: true });
    const illustration = hero.locator('img').first();
    await illustration.evaluate(image => image.decode());
    const logo = hero.getByRole('img', { name: 'お菓子争奪戦争ぷぷりえーる', exact: true });
    await expect(logo).toBeVisible();
    await logo.evaluate(image => image.decode());
    const art = await illustration.boundingBox(), mark = await logo.boundingBox();
    expect(Math.abs(art.width / art.height - 3000 / 2457)).toBeLessThan(.002);
    expect(mark.x).toBeGreaterThanOrEqual(art.x);
    expect(mark.x).toBeLessThan(art.x + art.width * .1);
    expect(mark.y).toBeLessThan(art.y + art.height * .1);
    const menu = hero.getByRole('navigation', { name: 'メニュー', exact: true });
    expect((await menu.boundingBox()).y).toBeGreaterThanOrEqual(art.y + art.height - 1);
    for (const [name, href] of [['ぷぷりえーるとは', '/about/'], ['ゲームをプレイ', '/game/'], ['デッキをつくる', '/build/']]) {
      const entry = menu.getByRole('link', { name, exact: true });
      await expect(entry).toHaveAttribute('href', href);
      await entry.click({ trial: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.addStyleTag({ content: 'nextjs-portal { display:none; }' });
    await page.screenshot({ path: info.outputPath('home-hero.png') });
  });
}
