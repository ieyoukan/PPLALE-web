import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

let fixture;
test.beforeAll(async () => {
  const { outputFiles } = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {GuestSignInPrompt} from './src/components/shared/auth/GuestSignInPrompt';
      createRoot(document.getElementById('root')).render(<GuestSignInPrompt compact={window.fixture.compact} purpose={window.fixture.purpose} />);`, loader: 'tsx', resolveDir: process.cwd() },
    jsx: 'automatic', bundle: true, write: false, outdir: '.cache/guest-sign-in-fixture', format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'guest-auth', setup(builder) {
      builder.onResolve({ filter: /^(@\/lib\/auth|next\/image)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'jsx', resolveDir: process.cwd(), contents: path === '@/lib/auth'
        ? `import {useSyncExternalStore} from 'react';
          const subscribe = notify => {window.addEventListener('auth-change',notify);return ()=>window.removeEventListener('auth-change',notify);};
          export function useAuth(){const auth=useSyncExternalStore(subscribe,()=>window.fixture.auth);return {...auth,signInWithGoogle:()=>window.fixture.signIn()};}`
        : `import React from 'react'; export default function Image({fill,unoptimized,fetchPriority,...props}){return <img {...props}/>;}` }));
    } }],
  });
  const css = outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const script = outputFiles.find(file => file.path.endsWith('.js')).text;
  const brand = await readFile('src/app/brand.css', 'utf8');
  fixture = `<html lang="ja"><style>${brand}\n${css}\n*{box-sizing:border-box}body{margin:16px;background:var(--brand-cream);font-family:sans-serif}#root{max-width:620px}button{cursor:pointer}</style><body><div id="root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`;
});

async function mount(page, { compact = false, loading = false, signedIn = false, purpose = 'social' } = {}) {
  await page.addInitScript(options => {
    window.fixture = { compact: options.compact, purpose: options.purpose, auth: { loading: options.loading, user: options.signedIn ? { uid: 'signed-in' } : null }, calls: 0,
      signIn() {
        this.calls++;
        return new Promise((resolve, reject) => {
          this.finish = success => {
            if (!success) return reject(new Error('popup closed'));
            this.auth = { user: { uid: 'signed-in' }, loading: false };
            window.dispatchEvent(new Event('auth-change')); resolve();
          };
        });
      },
    };
  }, { compact, loading, signedIn, purpose });
  await page.route('**/guest-sign-in-fixture', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('/guest-sign-in-fixture');
  return page.getByRole('region', { name: purpose === 'profile' ? 'プロフィールにログイン' : 'ログインのおすすめ' });
}

for (const compact of [false, true]) for (const width of [1280, 390]) {
  test(`guest login is optional, retriable and readable (${compact ? 'menu' : 'result'}, ${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const prompt = await mount(page, { compact });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByText('フレンドと、また遊ぼう', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.fixture.calls)).toBe(0);
    const button = prompt.getByRole('button', { name: 'Googleでログイン', exact: true });
    await expect(button).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('guest-sign-in.png') });
    await button.click();
    await expect(button).toBeDisabled();
    await button.evaluate(element => element.click());
    expect(await page.evaluate(() => window.fixture.calls)).toBe(1);
    await page.evaluate(() => window.fixture.finish(false));
    await expect(prompt.getByRole('alert')).toContainText('ログインできませんでした');
    await expect(button).toBeEnabled();
    await button.click();
    await page.evaluate(() => window.fixture.finish(true));
    await expect(prompt).toHaveCount(0);
    expect(await page.evaluate(() => window.fixture.calls)).toBe(2);
  });
}

for (const options of [{ loading: true }, { signedIn: true }]) test(`no login prompt while authentication is unresolved or already signed in (${JSON.stringify(options)})`, async ({ page }) => {
  const prompt = await mount(page, options);
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => window.fixture.calls)).toBe(0);
});

test('resolving guest authentication keeps the menu row the same height', async ({ page }) => {
  const prompt = await mount(page, { compact: true, loading: true });
  const before = await page.locator('#root').evaluate(element => element.offsetHeight);
  await page.evaluate(() => { window.fixture.auth = { user: null, loading: false }; window.dispatchEvent(new Event('auth-change')); });
  await expect(prompt).toBeVisible();
  expect(await page.locator('#root').evaluate(element => element.offsetHeight)).toBe(before);
});

test('a guest profile asks for sign-in after entry, retries safely and never opens a popup by itself', async ({ page }) => {
  const prompt = await mount(page, { purpose: 'profile' });
  await expect(prompt).toContainText('プロフィールを使うにはログインしてください');
  expect(await page.evaluate(() => window.fixture.calls)).toBe(0);
  const signIn = prompt.getByRole('button', { name: 'Googleでログイン' });
  await signIn.click();
  expect(await page.evaluate(() => window.fixture.calls)).toBe(1);
  await page.evaluate(() => window.fixture.finish(false));
  await expect(prompt.getByRole('alert')).toBeVisible();
  await signIn.click();
  await page.evaluate(() => window.fixture.finish(true));
  await expect(prompt).toHaveCount(0);
});
