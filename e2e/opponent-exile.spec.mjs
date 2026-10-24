import { test, expect } from '@playwright/test';
import { arena, hand, field } from '../packages/game-core/tests/helpers.mjs';

const key = 'pplale-game-session-v2';
const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, key);

for (const viewport of [{ width: 1280, height: 860 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}px opponent exile`, () => {
    test.use({ viewport });
    test('opponent images stay flat and fill their frames during and after exile', async ({ page }) => {
      const game = arena({ me: { hand: ['s_30'], field: ['y_9'] }, foe: { field: ['y_9', 'y_37'] } });
      game.players[0].played.push('s_28'); // Second chai: exile the selected opponent unit.
      const source = hand(game)[0], [target, remaining] = field(game, 1);
      await page.goto('/game/cpu/');
      await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
      await page.evaluate(({ key, game }) => localStorage.setItem(key, JSON.stringify({ game, mode: 'hotseat', level: 'easy' })), { key, game });
      await page.goto('/game/play/');
      await expect(page.locator('[data-table]')).toBeVisible();
      await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
      await page.clock.install();
      await page.locator(`[data-hand="${source}"]`).click();
      await page.getByRole('button', { name: '使う', exact: true }).click();
      await page.locator(`[data-unit="${target}"]`).click();
      const flight = page.locator('[data-draw-flight]').filter({ has: page.getByAltText('ぷらむ', { exact: true }) });
      await expect(flight).toBeVisible();
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(new Date(now + 1));
      await expect.poll(async () => (await savedGame(page)).players[1].exile).toContain(target);

      for (const progress of [0, .35, .75, 1]) {
        const face = await flight.evaluate((root, progress) => {
          for (const animation of root.getAnimations({ subtree: true })) {
            animation.pause();
            const timing = animation.effect.getTiming();
            animation.currentTime = Number(timing.delay) + Number(timing.duration) * progress;
          }
          const img = root.querySelector('img'), frame = img.parentElement;
          const imageBox = img.getBoundingClientRect(), frameBox = frame.getBoundingClientRect();
          return {
            frameTransform: getComputedStyle(frame).transform,
            sideTransform: getComputedStyle(frame.parentElement).transform,
            fit: getComputedStyle(img).objectFit,
            widthFill: imageBox.width / frameBox.width,
            heightFill: imageBox.height / frameBox.height,
            ratio: img.offsetWidth / img.offsetHeight,
          };
        }, progress);
        expect(face.frameTransform).toBe('none');
        expect(face.sideTransform).toBe('none');
        expect(face.fit).toBe('contain');
        expect(face.widthFill).toBeGreaterThan(.94);
        expect(face.heightFill).toBeGreaterThan(.94);
        expect(face.ratio).toBeCloseTo(533 / 800, 1);
      }
      await page.clock.runFor(1600);
      await expect(flight).toHaveCount(0);
      for (const uid of [remaining, field(game)[0]]) {
        const dimensions = await page.locator(`[data-unit="${uid}"]`).evaluate(root => {
          const image = root.querySelector('img');
          return { flat: getComputedStyle(root).transformStyle, ratio: image.offsetWidth / image.offsetHeight };
        });
        expect(dimensions.flat).toBe('flat');
        expect(dimensions.ratio).toBeCloseTo(533 / 800, 1);
      }
      await page.locator('[data-deck="1-exile"]').click();
      const image = page.getByRole('complementary').getByAltText('ぷらむ', { exact: true });
      await expect(image).toBeVisible();
      expect(await image.evaluate(img => img.offsetWidth / img.offsetHeight)).toBeCloseTo(533 / 800, 1);
    });
  });
}
