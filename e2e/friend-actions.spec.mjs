import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

let fixture;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { FriendActions } from './src/components/game/social/FriendActions';
      import styles from './src/components/game/social/Social.module.css';
      function App() {
        const [removed, setRemoved] = useState(false);
        return <section className={styles.panel}><h2>ありす</h2><div className={styles.actions}>
          {removed ? <button>＋ フレンド申請</button> : <FriendActions name="ありす" friendship={{ id: 'alice~bob', members: ['alice', 'bob'], requestedBy: 'alice', status: 'accepted' }} onRemoved={() => setRemoved(true)} />}
          <button>リンクをコピー</button>
        </div></section>;
      }
      createRoot(document.getElementById('root')).render(<App />);`, loader: 'tsx', resolveDir: process.cwd() },
    jsx: 'automatic', bundle: true, write: false, outfile: 'fixture.js', format: 'iife', platform: 'browser',
    loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'friend-storage', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/game\/social$/ }, () => ({ path: 'social', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export async function respondFriend(friendship, accept) {
        window.__changes.push({ friendship, accept });
        if (window.__fail) throw new Error('offline');
        if (window.__defer) await new Promise(resolve => { window.__complete = resolve; });
      }` }));
    } }],
  });
  fixture = { js: result.outputFiles.find(file => file.path.endsWith('.js')).text,
    css: result.outputFiles.find(file => file.path.endsWith('.css')).text,
    fonts: await readFile('src/app/generated/site-fonts.css', 'utf8'),
    brand: await readFile('src/app/brand.css', 'utf8') };
});
async function mount(page) {
  await page.route('**/friend-actions-test.html', route => route.fulfill({ contentType: 'text/html', body: '<body data-site-ui><div id="root"></div></body>' }));
  await page.goto('/friend-actions-test.html');
  await page.evaluate(() => { window.__changes = []; });
  await page.addStyleTag({ content: `${fixture.brand}\n${fixture.fonts}\n${fixture.css}\n:root { --font-site-body: 'Zen Maru Gothic'; --font-site-title: 'Mochiy Pop One'; } body { font-family: var(--font-site-body); } [data-site-ui] :is(h2, [data-ui-title]) { font-family: var(--font-site-title); font-weight: 400; }` });
  await page.addScriptTag({ content: fixture.js });
  await expect(page.getByRole('button', { name: 'フレンド', exact: true })).toBeVisible();
}
async function openConfirmation(page) {
  await page.getByRole('button', { name: 'フレンド', exact: true }).click();
  await page.getByRole('button', { name: 'フレンド解除', exact: true }).click();
  return page.getByRole('dialog', { name: 'フレンドを解除しますか？', exact: true });
}
for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  test(`friend dropdown opens below the button and requires confirmation (${viewport.width})`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await mount(page);
    const friend = page.getByRole('button', { name: 'フレンド', exact: true });
    const remove = page.getByRole('button', { name: 'フレンド解除', exact: true });
    await expect(remove).toHaveCount(0);
    const shareBox = await page.getByRole('button', { name: 'リンクをコピー' }).boundingBox();
    await friend.click();
    await expect(friend).toHaveAttribute('aria-expanded', 'true');
    const triggerBox = await friend.boundingBox(), menuBox = await remove.boundingBox();
    expect(menuBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
    expect((await page.getByRole('button', { name: 'リンクをコピー' }).boundingBox()).y).toBe(shareBox.y);
    await page.screenshot({ path: info.outputPath('friend-dropdown.png') });
    await page.keyboard.press('Escape');
    await expect(remove).toHaveCount(0);
    await expect(friend).toBeFocused();
    await friend.click();
    await page.getByRole('button', { name: 'リンクをコピー' }).click();
    await expect(remove).toHaveCount(0);
    const dialog = await openConfirmation(page);
    await expect(dialog).toContainText('ありすさんとのフレンドを解除します。');
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeFocused();
    expect(await page.evaluate(() => window.__changes)).toEqual([]);
    await page.screenshot({ path: info.outputPath('remove-friend-confirmation.png') });
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(friend).toBeFocused();
    expect(await page.evaluate(() => window.__changes)).toEqual([]);
    await openConfirmation(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(friend).toBeFocused();
    await openConfirmation(page);
    await dialog.getByRole('button', { name: '解除する', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '＋ フレンド申請' })).toBeVisible();
    expect(await page.evaluate(() => window.__changes)).toEqual([{ friendship: { id: 'alice~bob', members: ['alice', 'bob'], requestedBy: 'alice', status: 'accepted' }, accept: false }]);
  });
}
test('failed removal stays open for retry and pending removal cannot submit twice', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { window.__fail = true; });
  const dialog = await openConfirmation(page);
  await dialog.getByRole('button', { name: '解除する', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('解除できませんでした。もう一度お試しください');
  await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeEnabled();
  await page.evaluate(() => { window.__fail = false; window.__defer = true; });
  await dialog.getByRole('button', { name: '解除する', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '解除中…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__changes.length)).toBe(2);
  await page.evaluate(() => window.__complete());
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '＋ フレンド申請' })).toBeVisible();
});
