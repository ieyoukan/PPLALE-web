import { test, expect } from '@playwright/test';

for (const width of [390, 1280]) {
  test.describe(`home without JavaScript ${width}px`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width, height: 900 } });

    test('exposes the brand, introduction and navigation in the initial HTML', async ({ page }, info) => {
      await page.goto('/');
      await expect(page).toHaveTitle('ぷぷりえーる | お菓子争奪戦争・VRChatのカードゲーム');
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('お菓子争奪戦争ぷぷりえーる');
      await expect(page.getByRole('heading', { name: 'ゲームについて' })).toBeVisible();
      await expect(page.getByText('「お菓子争奪戦争ぷぷりえーる」は、', { exact: false })).toBeVisible();
      for (const href of ['/about', '/game', '/build', '/deck/2pick', '/tournament', '/deck-view']) {
        await expect(page.locator(`a[href="${href}/"]`).first()).toBeVisible();
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://pplale.vercel.app/');
      await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'ぷぷりえーる');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ルール・大会情報.*CPU対戦.*2Pick/);
      const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
      const website = schema['@graph'].find(node => node['@type'] === 'WebSite');
      expect(website.name).toBe('ぷぷりえーる');
      expect(website.url).toBe('https://pplale.vercel.app/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
    });
  });
}

test('hydrates the home page and draws cards without hydration errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: '山札からカードをピックアップする' }).click();
  const cards = page.getByRole('list', { name: 'ピックアップしたカード' }).getByRole('listitem');
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(3);
  expect(await cards.count()).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: '山札からカードをもう一度引く' }).click();
  await expect(cards.first()).toBeVisible();
  expect(errors.filter(error => /hydration|didn't match|does not match/i.test(error))).toEqual([]);
});

test('sitemap includes the home and public play entry with canonical trailing slashes', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  for (const path of ['', 'about/', 'game/', 'build/', 'deck/2pick/', 'tournament/']) {
    expect(xml).toContain(`<loc>https://pplale.vercel.app/${path}</loc>`);
  }
  expect(xml).not.toContain('<lastmod>');
});

for (const width of [320, 390, 1280]) {
  test(`illustrated home links fit and load at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const section = page.getByRole('region', { name: /もっと、/ });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole('link')).toHaveCount(5);
    const images = section.locator('img');
    await expect(images).toHaveCount(6);
    for (const img of await images.all()) {
      await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    await expect(section.getByRole('link', { name: /ブラウザで対戦/ }).locator('img')).toHaveAttribute('src', /baner.webp/);
    const font = await section.locator('h3').first().evaluate(el => getComputedStyle(el).fontFamily);
    expect(font).toMatch(/Zen[ _]Maru[ _]Gothic/);
    const loaded = await page.evaluate(async family => {
      const faces = await document.fonts.load(`700 20px ${family}`, '対戦大会画像構築');
      return faces.length > 0 && faces.every(face => face.status === 'loaded');
    }, font);
    expect(loaded).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const link of await section.getByRole('link').all()) {
      const bounds = await link.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await expect(page.getByText('ルールを知って、推しといっしょに遊ぼう！')).toHaveCount(0);
    await section.screenshot({ path: info.outputPath('illustrated-links.png') });
  });
}
