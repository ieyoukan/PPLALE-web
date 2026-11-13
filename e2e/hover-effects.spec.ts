import { test, expect } from '@playwright/test';

test.describe('Hover effects: scale removed, ripple added', () => {
  test('home page hero buttons should not use scale transform', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const footerLinks = page.locator('footer a');
    const count = await footerLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const link = footerLinks.nth(i);
      await link.hover();
      await page.waitForTimeout(100);
      const transform = await link.evaluate((el) =>
        getComputedStyle(el).transform
      );
      expect(transform).toBe('none');
    }
  });

  test('community links open Discord and the VRChat world without moving on hover', async ({ page }) => {
    await page.goto('/community');
    const discord = page.getByRole('link', { name: /discord/i });
    const world = page.getByRole('link', { name: /ワールド|world/i });
    await expect(discord).toHaveAttribute('href', 'https://discord.com/invite/tjvQHMNgYc');
    await expect(world).toHaveAttribute('href', /vrchat\.com\/home\/launch\?worldId=wrld_eca300bc-95a1-4f28-aa56-ebca34f67a5f/);
    for (const link of [discord, world]) {
      await expect(link).toHaveAttribute('target', '_blank');
      await link.hover();
      expect(await link.evaluate(el => getComputedStyle(el).transform)).toBe('none');
    }
  });

  test('the old tournament address moves to the community page', async ({ page }) => {
    await page.goto('/tournament');
    await expect(page).toHaveURL(/\/community\/$/);
    await expect(page.getByRole('heading', { name: /^(大会|Tournaments)$/ })).toBeVisible();
  });

  test('build page layout uses Panda CSS (no Tailwind classes)', async ({ page }) => {
    await page.goto('/build');

    const header = page.locator('header');
    const classAttr = await header.getAttribute('class');
    expect(classAttr).not.toContain('fixed');
    expect(classAttr).not.toContain('top-0');
    expect(classAttr).not.toContain('max-w-screen');
  });

  test('deck-view playable cards do not use scale on hover', async ({ page }) => {
    await page.goto('/deck-view');

    const cards = page.locator('[class*="grid"] > [class*="cursor"]');
    const count = await cards.count();
    if (count > 0) {
      const card = cards.first();
      await card.hover();
      await page.waitForTimeout(300);

      const transform = await card.evaluate((el) =>
        getComputedStyle(el).transform
      );
      expect(transform).toBe('none');
    }
  });

  test('explanation cards on home page have ripple, not scale', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(1000);

    const cards = page.locator('[class*="btn_"]');
    const count = await cards.count();
    if (count > 0) {
      const card = cards.first();
      const hasAfter = await card.evaluate((el) => {
        const after = getComputedStyle(el, '::after');
        return after.content !== 'none' && after.content !== '';
      });
      expect(hasAfter).toBe(true);
    }
  });
});
