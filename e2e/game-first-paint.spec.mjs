import { test, expect } from '@playwright/test';

for (const viewport of [{width:320,height:480}, {width:390,height:844}, {width:844,height:390}, {width:1280,height:720}, {width:2000,height:600}]) {
  test(`landscape menu paints before JavaScript and keeps its position: ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/_next/static/chunks/*.js', async route => { await held; await route.continue(); });
    await page.goto('/game/', { waitUntil:'commit' });
    const stage = page.locator('[data-game-stage]');
    await expect(page.getByRole('navigation', {name:'ゲームメニュー'})).toBeVisible();
    const before = await stage.boundingBox();
    expect(before.width).toBeGreaterThan(0);
    expect(before.height).toBeGreaterThan(0);
    expect(before.x).toBeGreaterThanOrEqual(-1);
    expect(before.y).toBeGreaterThanOrEqual(-1);
    expect(before.x + before.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(before.y + before.height).toBeLessThanOrEqual(viewport.height + 1);
    release();
    await page.waitForFunction(() => document.querySelector('[data-game-stage]').style.visibility === 'visible');
    const after = await stage.boundingBox();
    for (const key of ['x','y','width','height']) expect(Math.abs(after[key] - before[key]), key).toBeLessThan(1);
  });
}
