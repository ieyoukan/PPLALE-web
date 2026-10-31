import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let fixture;
test.beforeAll(async () => {
  const { outputFiles } = await build({
    stdin: {
      contents: `import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import ProfileOnboarding from './src/components/game/social/ProfileOnboarding';
        function App() {
          const [uid, setUid] = useState('first');
          const [route, setRoute] = useState(0);
          window.__account = setUid;
          window.__navigate = (path, search = '') => { window.__path = path; window.__search = search; setRoute(value => value + 1); };
          return <><button data-uid={uid ?? ''} onClick={() => window.__backgroundClicks++}>元の画面</button>{uid && <ProfileOnboarding key={uid} uid={uid} route={route} />}</>;
        }
        createRoot(document.getElementById('root')).render(<App />);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    jsx: 'automatic', bundle: true, write: false, outfile: 'fixture.js', format: 'iife', platform: 'browser',
    loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ROOM_SERVER_URL': '""' },
    plugins: [{ name: 'profile-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/navigation|next\/image|@\/lib\/auth|@\/lib\/game\/social)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
        const modules = {
          'next/navigation': 'export const usePathname = () => window.__path; export const useSearchParams = () => new URLSearchParams(window.__search);',
          'next/image': `import React from 'react'; export default function Image({ src, alt }) { return <img src={src} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />; }`,
          '@/lib/auth': 'export const useAuth = () => ({ signOut: async () => window.__account(null) });',
          '@/lib/game/social': `export const defaultProfile = (uid, displayName) => ({ uid, displayName, comment: 'よろしくお願いします！', iconCardId: 'p_1', decks: [] });
            export const enableSearch = async () => {};
            export async function readProfile(uid) {
              window.__reads.push(uid);
              if (window.__readFails) throw new Error('offline');
              if (window.__deferUid === uid) return new Promise(resolve => { window.__resolveRead = resolve; });
              return window.__profiles[uid] ?? null;
            }
            export async function saveProfile(profile) {
              window.__saves.push(profile);
              if (window.__saveFails) throw new Error('offline');
              window.__profiles[profile.uid] = { ...profile, displayName: profile.displayName.trim() };
              return window.__profiles[profile.uid];
            }`,
        };
        return { contents: modules[path], loader: 'jsx', resolveDir: process.cwd() };
      });
    } }],
  });
  fixture = { js: outputFiles.find(file => file.path.endsWith('.js')).text, css: outputFiles.find(file => file.path.endsWith('.css')).text,
    brand: await readFile(fileURLToPath(new URL('../src/app/brand.css', import.meta.url)), 'utf8') };
});

async function mount(page, options = {}) {
  await page.route('**/profile-onboarding-test.html', route => route.fulfill({ contentType: 'text/html', body: '<body data-site-ui><div id="root"></div></body>' }));
  await page.goto('/profile-onboarding-test.html');
  await page.evaluate(options => {
    Object.assign(window, { __path: '/build/', __search: '', __profiles: {}, __reads: [], __saves: [], __backgroundClicks: 0, ...options });
  }, options);
  await page.addStyleTag({ content: `${fixture.brand}\n${fixture.css}` });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addScriptTag({ content: fixture.js });
  await expect(page.locator('#root > button')).toBeVisible();
  expect(errors).toEqual([]);
}
const setup = page => page.getByRole('dialog', { name: 'はじめまして！' });

for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  test(`first login edits a public profile and resumes the same screen (${viewport.width})`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await mount(page);
    const dialog = setup(page), name = dialog.getByLabel('なまえ', { exact: true });
    await expect(dialog).toBeVisible();
    await expect(name).toHaveValue('');
    await expect(name).toBeFocused();
    await expect(dialog.getByRole('button', { name: '保存してはじめる' })).toBeDisabled();
    await name.fill('   ');
    await expect(dialog.getByRole('button', { name: '保存してはじめる' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await name.fill('ぷぷちゃん');
    await dialog.getByLabel('ひとこと', { exact: true }).fill('よろしくね！');
    await dialog.getByRole('button', { name: 'カードのアイコンを選ぶ', exact: true }).click();
    await dialog.getByRole('button', { name: 'あみのをアイコンにする', exact: true }).first().click();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: info.outputPath('profile-setup.png') });
    await page.evaluate(() => { window.__saveFails = true; });
    await dialog.getByRole('button', { name: '保存してはじめる' }).click();
    await expect(dialog.getByRole('alert')).toContainText('保存できませんでした');
    await expect(name).toHaveValue('ぷぷちゃん');
    await page.evaluate(() => { window.__saveFails = false; });
    await dialog.getByRole('button', { name: '保存してはじめる' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await page.evaluate(() => window.__saves.at(-1)))).toMatchObject({ uid: 'first', displayName: 'ぷぷちゃん', comment: 'よろしくね！' });
    await page.getByRole('button', { name: '元の画面' }).click();
    expect(await page.evaluate(() => window.__backgroundClicks)).toBe(1);
    await page.evaluate(() => window.__account(null));
    await expect(page.getByRole('button', { name: '元の画面' })).toHaveAttribute('data-uid', '');
    await page.evaluate(() => window.__account('first'));
    await expect.poll(() => page.evaluate(() => window.__reads.length)).toBeGreaterThanOrEqual(3);
    await expect(dialog).toHaveCount(0);
  });
}

test('saved profiles stay intact, and a different account starts with a blank name', async ({ page }) => {
  await mount(page, { __profiles: { first: { uid: 'first', displayName: 'プレイヤー' } } });
  await expect.poll(() => page.evaluate(() => window.__reads.length)).toBe(1);
  await expect(setup(page)).toHaveCount(0);
  await page.evaluate(() => window.__account('second'));
  await expect(setup(page)).toBeVisible();
  await expect(setup(page).getByLabel('なまえ', { exact: true })).toHaveValue('');
  await setup(page).getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(setup(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__saves)).toEqual([]);
});

test('profile lookup failures require a retry before editing; stale account lookups are ignored', async ({ page }) => {
  await mount(page, { __readFails: true });
  await expect(setup(page)).toContainText('プロフィールを確認できませんでした');
  await expect(setup(page).getByLabel('なまえ', { exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.__readFails = false; window.__deferUid = 'first'; });
  await setup(page).getByRole('button', { name: 'もう一度読み込む' }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__resolveRead)).toBe('function');
  await page.evaluate(() => window.__account('second'));
  await expect(setup(page)).toBeVisible();
  await page.evaluate(() => window.__resolveRead({ uid: 'first', displayName: '古いアカウント' }));
  await expect(setup(page)).toBeVisible();
  await setup(page).getByLabel('なまえ', { exact: true }).fill('新しい名前');
  await setup(page).getByRole('button', { name: '保存してはじめる' }).click();
  await expect(setup(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__saves[0].uid)).toBe('second');
});

test('the own-profile page uses its inline editor; visiting another profile opens setup', async ({ page }) => {
  await mount(page, { __path: '/game/profile/' });
  await expect.poll(() => page.evaluate(() => window.__reads.length)).toBe(1);
  await expect(setup(page)).toHaveCount(0);
  await page.evaluate(() => window.__navigate('/game/profile/', '?id=someone-else'));
  await expect(setup(page)).toBeVisible();
});
