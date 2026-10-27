import { test, expect } from '@playwright/test';

const titleFont = /Mochiy[ _]Pop[ _]One/;
const bodyFont = /Zen[ _]Maru[ _]Gothic/;
const fontOf = locator => locator.evaluate(el => getComputedStyle(el).fontFamily);

for (const width of [390, 1280]) {
  test.describe(`site typography ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, locale: 'ja-JP' });

    for (const path of ['/build/', '/deck/2pick/', '/game/cpu/', '/game/battle/', '/tournament/', '/about/', '/contact/']) {
      test(`${path} shares headings and body fonts`, async ({ page }, info) => {
        await page.goto(path);
        const heading = page.locator('h1, h2').first();
        await expect(heading).toBeVisible();
        expect(await fontOf(heading)).toMatch(titleFont);
        expect(await fontOf(page.locator('body'))).toMatch(bodyFont);
        const input = page.locator('select:visible, input:visible, textarea:visible').first();
        if (await input.count()) expect(await fontOf(input)).toMatch(bodyFont);
        const font = await fontOf(heading);
        expect(await page.evaluate(async family => {
          const faces = await document.fonts.load(`400 20px ${family}`, 'デッキ構築対戦');
          return faces.length > 0 && faces.every(face => face.status === 'loaded');
        }, font)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (path === '/game/cpu/' || path === '/build/') {
          await page.screenshot({ path: info.outputPath('typography.png') });
        }
      });
    }

    test('menu names use the title font and help text uses the body font', async ({ page }) => {
      await page.goto('/game/cpu/');
      // The game's screens are tabs of the launchpad, which opens on the CPU screen.
      const cpu = page.getByRole('dialog', { name: 'ゲームメニュー' }).getByRole('tab', { name: 'CPU対決' });
      await expect(cpu.locator('span')).toHaveAttribute('data-ui-title', 'true');
      await expect.poll(() => fontOf(cpu.locator('span'))).toMatch(titleFont);
      expect(await fontOf(page.getByRole('group', { name: 'CPUの強さ' }).getByRole('button').first())).toMatch(bodyFont);
      await expect(page.getByRole('button', { name: '対戦をはじめる', exact: false }).first()).toBeEnabled();
    });
  });
}

test('starting a match keeps the board and numerical counters readable', async ({ page }) => {
  await page.goto('/game/cpu/');
  await page.getByRole('button', { name: '対戦をはじめる', exact: false }).first().click();
  await page.waitForURL(/\/game\/play\//);
  const board = page.locator('[data-readable]').first();
  await expect(board).toBeVisible();
  await expect.poll(() => fontOf(board)).toContain('Arial');
  expect(await fontOf(board)).not.toMatch(titleFont);
  // メニューの見出し書体が盤面内のボタンにも流れ込まない。
  const menu = page.getByRole('button', { name: 'メニュー', exact: true });
  await expect(menu).toBeVisible();
  expect(await fontOf(menu)).not.toMatch(titleFont);
});
